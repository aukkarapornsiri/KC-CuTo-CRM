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
 await form.getByLabel('Contract start',{exact:true}).fill('2026-11-01');await form.getByLabel('Contract end',{exact:true}).fill('2026-11-30');
 await form.getByRole('combobox',{name:'name 1',exact:true}).fill('QA-R');await form.getByRole('option',{name:/QA Recurring Service/}).click();
 await form.getByRole('button',{name:'Short-term / Lump sum',exact:true}).click();
 assert.equal(await form.locator('[data-rental-step]').count(),4);
 await form.getByLabel('rental end 1',{exact:true}).fill('2026-11-07');await form.getByLabel('qty 1',{exact:true}).fill('5');await form.getByLabel('price 1',{exact:true}).fill('12000');await form.getByLabel('lump cost 1',{exact:true}).fill('8000');
 await form.getByRole('switch',{name:'Enable security deposit'}).check();await form.getByLabel('Refundable deposit',{exact:true}).fill('5000');
 await form.getByLabel('Deposit return terms',{exact:true}).fill('Return after inspection');
 await form.locator('.kc-rental-settings').screenshot({path:`test-artifacts/rental-settings-${width}.png`});
 assert.match(await form.locator('.kc-quote-totals').innerText(),/12,840.00/);assert.match(await form.locator('.kc-quote-totals').innerText(),/4,000.00/);
 assert.equal(await form.getByLabel('cycles 1',{exact:true}).count(),0);
 await form.getByRole('button',{name:'Preview',exact:true}).click();const preview=page.locator('.kc-quotation-preview.is-visible');await preview.waitFor();assert.match(await preview.innerText(),/17,840.00/);assert.match(await preview.innerText(),/Lump sum/);assert.doesNotMatch(await preview.innerText(),/8,000.00/);await preview.screenshot({path:`test-artifacts/rental-preview-${width}.png`});
 await form.getByRole('button',{name:'Back to edit',exact:true}).click();
 await form.getByRole('radio',{name:'Partial rental payment',exact:true}).check();await form.getByLabel('Partial rental amount',{exact:true}).fill('6000');await form.getByLabel('Rental balance terms',{exact:true}).fill('Before collection');
 assert.match(await form.locator('.kc-rental-settings').innerText(),/6,840.00/);assert.match(await form.locator('.kc-rental-settings').innerText(),/11,000.00/);
 await form.getByRole('switch',{name:'Enable security deposit'}).uncheck();assert.match(await form.locator('.kc-rental-gp').last().innerText(),/6,000.00/);await form.getByRole('switch',{name:'Enable security deposit'}).check();await form.getByLabel('Refundable deposit',{exact:true}).fill('5000');
 await form.getByRole('button',{name:'Save document',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved'}).waitFor();
 const saved=await page.evaluate(()=>window.qaRecords.quotations[0]);assert.equal(saved.total,12840);assert.equal(saved.items[0].cost,8000);assert.equal(saved.items[0].qty,5);assert.equal(saved.recurring.rental.deposit,5000);assert.equal(saved.recurring.rental.partial_amount,6000);assert.equal(saved.recurring.rental.payment,'partial');assert.equal(saved.items[0].service_end,'2026-11-07');
 const detail=page.getByRole('dialog',{name:'Quotation details',exact:true});await detail.getByRole('button',{name:'Edit',exact:true}).click();await form.waitFor();assert.equal(Number((await form.getByLabel('lump cost 1',{exact:true}).inputValue()).replaceAll(',','')),8000);assert.equal(Number((await form.getByLabel('Refundable deposit',{exact:true}).inputValue()).replaceAll(',','')),5000);
 await form.getByRole('button',{name:'Preview',exact:true}).click();
 const printModule=await page.evaluate(async()=>await(await fetch('./src/quotation-print.mjs')).text());
 await page.evaluate('(async()=>{'+printModule.replaceAll('export ','')+';const source=document.querySelector(".kc-quotation-preview.is-visible");document.head.querySelectorAll("style,link[rel=stylesheet]").forEach(n=>n.remove());const style=document.createElement("style");style.textContent=quotationPrintCSS;document.head.append(style);const table=buildQuotationPrint(source,document);document.body.replaceChildren(table);await prepareQuotationPrint(table,document);})()');
 assert.match(await page.locator('body').innerText(),/11,000.00/);assert.match(await page.locator('body').innerText(),/6,840.00/);assert.equal(await page.locator('.kc-rental-band').count(),1);assert.doesNotMatch(await page.locator('body').innerText(),/8,000.00/);await page.emulateMedia({media:'print'});await page.screenshot({path:`test-artifacts/rental-print-${width}.png`,fullPage:true});await page.pdf({path:`test-artifacts/rental-${width}.pdf`,preferCSSPageSize:true});assert.deepEqual(errors,[]);await page.close();console.log('PASS fixed rental save/reopen and private cost '+width);
}}finally{await browser.close();}
