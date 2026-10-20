import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
try {
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/');
  await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
  await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
  await page.evaluate(async()=>{
   const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();
   const uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];
   const {DEMO_RECORDS}=await import(new URL(uri,location.href).href);
   DEMO_RECORDS.customers=[{id:'contact-customer',name:'QA Company',email:'company@example.test',phone:'111'}];DEMO_RECORDS.contacts=[{id:'contact-one',customer_id:'contact-customer',name:'Latest Contact',email:'latest@example.test',phone:'222',status:'active',is_primary:true}];
   DEMO_RECORDS.quotations=Array.from({length:50},(_,i)=>({id:'quote-'+i,code:'QA-QUOTE-'+i,customer_id:'contact-customer',contact_id:'contact-one',contact_name:'Old Contact',document_language:'th',customer_name:'QA Company',status:i?'approved':'submitted',approval_status:i?'approved':'pending',items:[{name:'HCI Node',qty:3,unit:'EA',price:700000,total:2100000,discount:0,cost:500000}],subtotal:2100000,discount:0,vat:147000,total:2247000}));
  });
  if(width>=1024)await openDesktopMenu(page,'Quotations','Quotation List');
  else {
   await page.locator('button.lg\\:hidden').first().click();
   const nav=page.locator('div.fixed.top-0.left-0.h-full.w-64.lg\\:hidden');
   await nav.getByRole('button',{name:'Sales',exact:true}).click();
   await nav.getByText('Quotations',{exact:true}).click();
   await nav.getByText('Quotation List',{exact:true}).click();
  }
  for(const [code,entry] of [['QA-QUOTE-0','Details '],['QA-QUOTE-1','Open Quotation ']]){
   await page.getByRole('button',{name:entry+code,exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Quotation details',exact:true});
   await dialog.waitFor();assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
   const box=await dialog.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=901&&box.x>=0&&box.x+box.width<=width+1);
   assert.ok((await dialog.innerText()).includes('HCI Node'));
   await dialog.locator('tfoot').getByText('600,000.00',{exact:true}).waitFor();
   assert.equal(await dialog.locator('tbody .crm-internal-financial').first().innerText(),'600,000.00');
   assert.equal(await dialog.locator('tfoot .crm-internal-financial').last().innerText(),'28.57');
   assert.equal(await dialog.getByRole('button',{name:'Edit',exact:true}).isDisabled(),true);
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
   await page.getByRole('button',{name:entry+code,exact:true}).click();
   await dialog.evaluate(el=>{el.scrollTop=el.scrollHeight;});
   const close=dialog.getByRole('button',{name:'Close quotation details',exact:true});
   const closeBox=await close.boundingBox(),dialogBox=await dialog.boundingBox();
   assert.ok(closeBox.y>=dialogBox.y&&closeBox.y+closeBox.height<=dialogBox.y+90,'Close stays visible after scrolling');
   await close.click();await dialog.waitFor({state:'hidden'});
  }
  await page.getByRole('button',{name:'Details QA-QUOTE-0',exact:true}).click();
  await page.getByRole('dialog',{name:'Quotation details',exact:true}).getByRole('button',{name:'Print / Save PDF',exact:true}).click();
  await page.locator('.kc-quotation-preview.is-visible').waitFor();
  assert.equal(await page.locator('.crm-quotation-detail-dialog').count(),0);
  assert.ok((await page.locator('.kc-quotation-preview.is-visible').innerText()).includes('HCI Node'));
  const preview=page.locator('.kc-quotation-preview.is-visible');
  assert.equal(await preview.locator('.kc-quote-preview-company strong').innerText(),'บริษัท เทคแซฟวี จำกัด');
  const fields=preview.locator('.kc-quote-customer-fields');assert.match(await fields.innerText(),/latest@example.test/);assert.match(await fields.innerText(),/Latest Contact/);assert.ok(!(await fields.innerText()).includes('วันครบกำหนด'));
  await page.evaluate(async()=>{const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();const uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];const {DEMO_RECORDS:r}=await import(new URL(uri,location.href).href);Object.assign(r.contacts[0],{name:'Changed Contact',email:'changed@example.test',phone:'333'});window.dispatchEvent(new Event('focus'));});
  await fields.getByText('changed@example.test',{exact:true}).waitFor();await fields.getByText('Changed Contact',{exact:true}).waitFor();
  const printModule=await page.evaluate(async()=>{const source=await(await fetch('./src/quotation-print.mjs')).text();return source;});
  await page.evaluate('(async()=>{'+printModule.replaceAll('export ','')+';const source=document.querySelector(".kc-quotation-preview.is-visible");const style=document.createElement("style");style.textContent=quotationPrintCSS;document.head.append(style);const table=buildQuotationPrint(source,document);document.body.replaceChildren(table);await prepareQuotationPrint(table,document);})()');
  assert.match(await page.locator('body').innerText(),/changed@example.test/);assert.ok(!(await page.locator('body').innerText()).includes('Tech Savvy Co., Ltd.'));
  await page.pdf({path:`test-artifacts/quotation-contact-${width}.pdf`,preferCSSPageSize:true});
  assert.deepEqual(errors,[]);
  console.log(`PASS quotation details ${width}px: 50-row list, pending/approved, Details/code links, modal viewport, Escape/close/reopen, print preview`);
  await page.close();
 }
} finally {await browser.close();}
