import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/?demo=1');
  await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
  await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
  await page.evaluate(async()=>{
   const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();
   const uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];
   const {DEMO_RECORDS:r}=await import(new URL(uri,location.href).href);
   r.native_sales_orders=[];r.sales_order_events=[];r.sales_orders=[];
   r.quotations=['APPROVED','CANCEL','DRAFT'].map((name,i)=>({id:'native-quote-'+i,code:'QA-'+name,customer_id:'native-customer',customer_name:'Native SO Customer',owner_id:'demo-owner',owner_name:'QA Sales',status:i===2?'draft':'approved',approval_status:i===2?null:'approved',counterparty_address:'1 Example Road, Bangkok, 10160, Thailand',currency:'THB',items:[{name:'Test service',qty:2,unit:'Unit',price:100,total:200,discount:0}],subtotal:200,discount:0,vat:14,total:214,net_total:214}));
  });
  if(width>=1024)await openDesktopMenu(page,'Quotations','Quotation List');
  else{await page.locator('button.lg\\:hidden').first().click();const nav=page.locator('div.fixed.top-0.left-0.h-full.w-64.lg\\:hidden');await nav.getByRole('button',{name:'Sales',exact:true}).click();await nav.getByText('Quotations',{exact:true}).click();await nav.getByText('Quotation List',{exact:true}).click();}
  const popup=page.getByRole('dialog',{name:'Sales Orders',exact:true});
  async function fromQuote(code){await page.getByRole('button',{name:'Details '+code,exact:true}).click();await page.getByRole('dialog',{name:'Quotation details',exact:true}).getByRole('button',{name:'Receive PO / Sales Order',exact:true}).click();await popup.waitFor();}
  async function create(code){await fromQuote(code);await popup.getByLabel('Customer PO number',{exact:true}).fill('PO-'+code);await popup.getByLabel('PO date',{exact:true}).fill('2026-01-01');await popup.locator('input[type=file]').setInputFiles({name:'customer-po.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nQA\n%%EOF')});await popup.getByRole('button',{name:'Confirm Sales Order',exact:true}).click();await popup.getByRole('heading',{name:/SO-DEMO/}).waitFor();}
  await create('QA-APPROVED');
  await popup.getByText('1 Example Road, Bangkok, 10160, Thailand',{exact:true}).waitFor();
  const box=await popup.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=901,'SO popup fits viewport');
  assert.ok(await popup.locator('.crm-so').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'No horizontal page overflow');
  await popup.getByRole('button',{name:'Close form',exact:true}).click();
  await fromQuote('QA-APPROVED');
  assert.equal(await popup.getByRole('button',{name:'Confirm Sales Order',exact:true}).count(),0,'Existing SO opens instead of duplicate conversion');
  await popup.getByRole('button',{name:'Record full delivery',exact:true}).click();await popup.getByLabel('Delivery reference / evidence',{exact:true}).fill('DEL-001');await popup.getByRole('button',{name:'Confirm',exact:true}).click();
  await popup.getByRole('button',{name:'Complete order',exact:true}).click();await popup.getByRole('button',{name:'Confirm',exact:true}).click();await popup.getByRole('heading',{name:/Completed/}).waitFor();
  await popup.getByRole('button',{name:'Close form',exact:true}).click();
  await create('QA-CANCEL');await popup.getByRole('button',{name:'Cancel SO',exact:true}).click();await popup.getByLabel('Cancellation reason',{exact:true}).fill('Customer cancelled');await popup.getByRole('button',{name:'Confirm',exact:true}).click();await popup.getByRole('heading',{name:/Cancelled/}).waitFor();
  await popup.getByRole('button',{name:'Back to orders',exact:true}).click();assert.match(await popup.locator('article').first().innerText(),/SO-DEMO-000002/);
  await popup.getByRole('button',{name:'Close form',exact:true}).click();
  await fromQuote('QA-DRAFT');await popup.getByText('The quotation must be approved before creating an SO',{exact:true}).waitFor();assert.equal(await popup.getByRole('button',{name:'Confirm Sales Order',exact:true}).count(),0);
  await popup.getByRole('button',{name:'Close form',exact:true}).click();
  await page.getByRole('button',{name:'Switch to Thai',exact:true}).click();
  await page.getByRole('button',{name:'ใบสั่งขาย (SO)',exact:true}).click();await page.getByRole('dialog',{name:'ใบสั่งขาย (Sales Orders)',exact:true}).getByText('ยกเลิก',{exact:true}).first().waitFor();
  assert.deepEqual(errors,[]);await page.close();console.log(`PASS native SO ${width}px: approved conversion, PO upload, idempotent reopen, delivery, completion, cancellation, newest first, draft gate, TH/EN and viewport`);
 }
}finally{await browser.close();}
