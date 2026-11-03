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
   DEMO_RECORDS.quotations=Array.from({length:50},(_,i)=>({id:'quote-'+i,code:'QA-QUOTE-'+i,customer_name:'QA Company',issue_date:'2026-11-03',valid_until:'2026-11-06',payment_terms:0,payment_term_code:'cash',counterparty_tax_id:'0125568016470',counterparty_address:'119/531 Rattanathibet Road, Nonthaburi',prepared_by_email:'sales@example.test',prepared_by_phone:'021234567',project_name:'Sales',payment_instructions:'50% deposit before delivery',document_language:'en',currency:'THB',prepared_by:i?'Monchai Aukkarapornsiri':'',status:i?'approved':'submitted',approval_status:i?'approved':'pending',items:[{name:'HCI Node',qty:3,unit:'EA',price:700000,total:2100000,discount:0,cost:500000}],subtotal:2100000,discount:0,vat:147000,total:2247000}));
  });
  if(width>=1024)await openDesktopMenu(page,'Quotations','Quotation List');
  else {
   await page.locator('button.lg\\:hidden').first().click();
   const nav=page.locator('div.fixed.top-0.left-0.h-full.w-64.lg\\:hidden');
   await nav.getByRole('button',{name:'Sales',exact:true}).click();
   await nav.getByText('Quotations',{exact:true}).click();
   await nav.getByText('Quotation List',{exact:true}).click();
  }
  await page.locator('[data-entity=quotations] thead [data-field=prepared_by]').waitFor();
  const summary=page.getByRole('region',{name:'Quotation summary'});
  await summary.waitFor();assert.equal(await summary.locator('.crm-master-form').count(),4);
  assert.deepEqual(await summary.locator('p').allTextContents(),['50','112,350,000 THB','110,103,000 THB','0%']);
  assert.ok(await summary.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Summary cards fit viewport');
  assert.equal(await page.locator('[data-entity=quotations] tbody tr').filter({has:page.getByRole('button',{name:'Details QA-QUOTE-0',exact:true})}).locator('[data-field=prepared_by]').innerText(),'Not specified');
  assert.equal(await page.locator('[data-entity=quotations] tbody tr').filter({has:page.getByRole('button',{name:'Details QA-QUOTE-1',exact:true})}).locator('[data-field=prepared_by]').innerText(),'Monchai A.');
  for(const [code,entry] of [['QA-QUOTE-0','Details '],['QA-QUOTE-1','Open Quotation ']]){
   await page.getByRole('button',{name:entry+code,exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'Quotation details',exact:true});
   await dialog.waitFor();assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
   const box=await dialog.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=901&&box.x>=0&&box.x+box.width<=width+1);
   const cards=dialog.locator('.kc-quote-card-grid>.kc-quote-card');assert.equal(await cards.count(),6);
   const sizes=await cards.evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,sw:n.scrollWidth,cw:n.clientWidth})));
   assert.ok(sizes.every(b=>b.sw<=b.cw+1),JSON.stringify(sizes));if(width>760)assert.ok(sizes.every(b=>Math.abs(b.w-sizes[0].w)<1&&Math.abs(b.h-sizes[0].h)<1),JSON.stringify(sizes));
   assert.ok((await dialog.innerText()).includes('119/531 Rattanathibet Road'));
   assert.ok((await dialog.innerText()).includes('50% deposit before delivery'));
   assert.ok(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Detail has no horizontal overflow');
   await dialog.screenshot({path:'test-artifacts/quotation-detail-cards-'+code+'-'+width+'.png'});
   await dialog.getByRole('button',{name:'Items and services',exact:true}).click();
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
  assert.deepEqual(errors,[]);
  console.log(`PASS quotation details ${width}px: 50-row list, pending/approved, Details/code links, modal viewport, Escape/close/reopen, print preview`);
  await page.close();
 }
} finally {await browser.close();}
