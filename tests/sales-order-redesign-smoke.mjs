import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}: {})});
try{
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/?demo=1');
  await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
  await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
  await page.getByRole('button',{name:'User profile',exact:true}).click();
  await page.getByRole('button',{name:'Edit profile',exact:true}).click();
  const profileDialog=page.getByRole('dialog',{name:'My profile',exact:true});
  const signaturePNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a10sAAAAASUVORK5CYII=','base64');
  await profileDialog.getByLabel('Upload Profile signature',{exact:true}).setInputFiles({name:'qa-signature.png',mimeType:'image/png',buffer:signaturePNG});
  await profileDialog.getByRole('button',{name:'Save signature',exact:true}).click();
  await profileDialog.getByText('Signature saved',{exact:true}).waitFor();
  await profileDialog.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.evaluate(async()=>{
   const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();
   const uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];
   const {DEMO_RECORDS:r}=await import(new URL(uri,location.href).href);
   r.native_sales_orders=[];r.sales_order_events=[];r.sales_orders=[];
   r.quotations=['APPROVED','CANCEL','DRAFT'].map((name,i)=>({id:'native-quote-'+i,code:'QA-'+name,customer_id:'native-customer',customer_name:'Native SO Customer',owner_id:'demo-owner',owner_name:'QA Sales',status:i===2?'draft':'approved',approval_status:i===2?null:'approved',counterparty_address:'1 Example Road, Bangkok, 10160, Thailand',currency:'THB',items:[{name:'Test service',qty:2,unit:'Unit',price:100,cost:60,part_number:'PN-123',desc:'Specification QA',total:200,discount:0}],subtotal:200,discount:0,vat:14,total:214,net_total:214}));
  });
  if(width>=1024)await openDesktopMenu(page,'Quotations','Quotation List');
  else{await page.locator('button.lg\\:hidden').first().click();const nav=page.locator('div.fixed.top-0.left-0.h-full.w-64.lg\\:hidden');await nav.getByRole('button',{name:'Sales',exact:true}).click();await nav.getByText('Quotations',{exact:true}).click();await nav.getByText('Quotation List',{exact:true}).click();}
  const popup=page.getByRole('dialog',{name:'Sales Orders',exact:true});
  async function fromQuote(code){await page.getByRole('button',{name:'Details '+code,exact:true}).click();await page.getByRole('dialog',{name:'Quotation details',exact:true}).getByRole('button',{name:'Convert Sales Order',exact:true}).click();await popup.waitFor();}
  async function create(code){await fromQuote(code);assert.equal(await popup.locator('[data-field=part_number]').innerText(),'PN-123');await popup.getByLabel('Customer PO number',{exact:true}).fill('PO-'+code);await popup.getByLabel('PO date',{exact:true}).fill('2026-01-01');await popup.getByLabel('Order type',{exact:true}).fill('Runrate');await popup.getByLabel('Shipping address',{exact:true}).fill('QA Warehouse 2');await popup.getByLabel('Recipient name',{exact:true}).fill('QA Recipient');await popup.getByLabel('Recipient phone',{exact:true}).fill('0810000000');await popup.getByLabel('Installation required',{exact:true}).selectOption('no');await popup.locator('input[type=file]').setInputFiles({name:'customer-po.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nQA\n%%EOF')});await popup.getByLabel('Special conditions / SO notes',{exact:true}).fill('Free gift delivered later');await popup.getByRole('button',{name:'Convert Sales Order',exact:true}).click();await popup.getByRole('heading',{name:/SO-DEMO/}).waitFor();}
  await create('QA-APPROVED');
  await popup.getByRole('button',{name:'Back to orders',exact:true}).click();
  await popup.getByRole('heading',{name:'Sales orders',exact:true}).waitFor();
  assert.equal(await popup.locator('.crm-so-metric').count(),4);
  await popup.locator('.crm-so-filters input').fill('QA-APPROVED');
  assert.equal(await popup.locator('tbody tr').count(),1);
  await popup.locator('.crm-so-filters input').fill('NOT-A-MATCH');
  await popup.getByText('No orders match these filters',{exact:true}).waitFor();
  await popup.getByRole('button',{name:'Reset filters',exact:true}).click();
  await popup.getByRole('button',{name:'Open SO',exact:true}).click();
  await popup.getByRole('heading',{name:'Connected records',exact:true}).waitFor();
  assert.equal(await popup.getByRole('button',{name:'Follow-up Center',exact:true}).count(),1);
  await popup.getByRole('button',{name:'Back to orders',exact:true}).click();
  assert.ok(await popup.locator('.crm-so').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'SO fits viewport');
  await popup.screenshot({path:`test-artifacts/so-redesign-${width}.png`});
  assert.deepEqual(errors,[]);
  await page.close();
 }
}finally{await browser.close();}
