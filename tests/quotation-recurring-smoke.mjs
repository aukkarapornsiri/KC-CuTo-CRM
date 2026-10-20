import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/?demo=1');
 await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
 await page.evaluate(async()=>{const source=await(await fetch([...document.scripts].find(x=>x.src.includes('app-C2')).src)).text(),uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];const {DEMO_RECORDS:d}=await import(new URL(uri,location.href).href);window.qaRecords=d;d.prices=[{id:'price',code:'QA-R',name:'QA Recurring Service',price:500,cost:200,unit:'Unit',status:'active'}];d.customers=[{id:'customer',code:'C1',name:'QA Customer',email:'qa@example.test'}];d.quotations=[];});
 if(width>=1024)await openDesktopMenu(page,'Quotations','Quotation List');else{await page.locator('button.lg\\:hidden').first().click();const nav=page.locator('div.fixed.top-0.left-0.h-full.w-64.lg\\:hidden');await nav.getByRole('button',{name:'Sales',exact:true}).click();await nav.getByText('Quotations',{exact:true}).click();await nav.getByText('Quotation List',{exact:true}).click();}
 await page.getByRole('button',{name:'Add record',exact:true}).click();
 const chooser=page.getByRole('dialog',{name:'Choose quotation type'});await chooser.waitFor();await chooser.screenshot({path:`test-artifacts/recurring-choice-${width}.png`});
 await chooser.getByRole('button',{name:'Recurring quotation',exact:true}).click();
 const form=page.getByRole('form',{name:'Quotation form',exact:true});await form.getByRole('combobox',{name:'Customer',exact:true}).fill('QA Customer');await form.getByRole('option',{name:'QA Customer C1',exact:true}).click();
 await form.getByLabel('Contract start',{exact:true}).fill('2026-11-01');await form.getByLabel('Contract end',{exact:true}).fill('2027-10-31');
 for(const [i,period,cycles,qty,price] of [[1,'day',30,1,300],[2,'month',12,10,500],[3,'year',1,1,12000]]){
  if(i>1)await form.getByRole('button',{name:'Add line',exact:false}).click();
  await form.getByRole('combobox',{name:'name '+i,exact:true}).fill('QA-R');await form.getByRole('option',{name:/QA Recurring Service/}).click();
  await form.getByLabel('billing cycle '+i,{exact:true}).selectOption(period);await form.getByLabel('cycles '+i,{exact:true}).fill(String(cycles));await form.getByLabel('service start '+i,{exact:true}).fill('2026-11-01');await form.getByLabel('qty '+i,{exact:true}).fill(String(qty));await form.getByLabel('price '+i,{exact:true}).fill(String(price));
 }
 assert.match(await form.locator('.kc-quote-totals').innerText(),/86,670.00/);assert.equal(await form.locator('.kc-quote-status').innerText(),'Draft');await form.getByLabel('cycles 2',{exact:true}).fill('0');assert.match(await form.locator('.kc-quote-dialog-footer [role=alert]').innerText(),/Cannot calculate totals/);assert.match(await form.locator('.kc-quote-totals .total').innerText(),/—/);assert.equal(await form.getByRole('button',{name:'Preview',exact:true}).isDisabled(),true);await form.getByLabel('cycles 2',{exact:true}).fill('12');
 await form.getByRole('button',{name:'Preview',exact:true}).click();const preview=page.locator('.kc-quotation-preview.is-visible');await preview.waitFor();assert.equal(await preview.locator('.kc-quote-print-status').innerText(),'Draft');assert.equal(await preview.locator('.kc-recurring-line-summary').count(),3);assert.match(await preview.locator('.kc-recurring-summary').innerText(),/2026-11-01/);assert.match(await preview.innerText(),/86,670.00/);await preview.screenshot({path:`test-artifacts/recurring-preview-${width}.png`});
 await form.getByRole('button',{name:'Back to edit',exact:true}).click();
 await form.getByRole('button',{name:'Save document',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved'}).waitFor();
 const saved=await page.evaluate(()=>window.qaRecords.quotations[0]);assert.equal(saved.quotation_kind,'recurring');assert.equal(saved.total,86670);assert.equal(saved.items[1].cycle_count,12);assert.equal(saved.recurring.end_date,'2027-10-31');
 const detail=page.getByRole('dialog',{name:'Quotation details',exact:true});await detail.getByRole('button',{name:'Edit',exact:true}).click();await form.waitFor();assert.equal(await form.getByLabel('cycles 2',{exact:true}).inputValue(),'12');
 await form.getByLabel('cycles 2',{exact:true}).fill('13');await form.getByRole('button',{name:'Save document',exact:true}).click();assert.match(await form.locator('.kc-quote-dialog-footer [role=alert]').innerText(),/within the contract/);await form.getByLabel('cycles 2',{exact:true}).fill('12');
 await form.getByRole('button',{name:'Preview',exact:true}).click();
 const printModule=await page.evaluate(async()=>await(await fetch('./src/quotation-print.mjs')).text());
 await page.evaluate('(async()=>{'+printModule.replaceAll('export ','')+';const source=document.querySelector(".kc-quotation-preview.is-visible");document.head.querySelectorAll("style,link[rel=stylesheet]").forEach(n=>n.remove());const style=document.createElement("style");style.textContent=quotationPrintCSS;document.head.append(style);const table=buildQuotationPrint(source,document);document.body.replaceChildren(table);await prepareQuotationPrint(table,document);})()');
 assert.match(await page.locator('body').innerText(),/Monthly/);assert.match(await page.locator('body').innerText(),/2027-10-31/);await page.emulateMedia({media:'print'});assert.equal(await page.locator('.kc-print-page').first().isVisible(),true);await page.screenshot({path:`test-artifacts/recurring-print-${width}.png`,fullPage:true});await page.pdf({path:`test-artifacts/recurring-${width}.pdf`,preferCSSPageSize:true});assert.deepEqual(errors,[]);await page.close();console.log('PASS recurring chooser, mixed cycles, save/reopen, bounds, print '+width);
}}finally{await browser.close();}
