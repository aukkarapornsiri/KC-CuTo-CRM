import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
try {
 for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/');
  await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();
  await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
  await page.evaluate(async()=>{
   const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();
   const uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];
   const {DEMO_RECORDS}=await import(new URL(uri,location.href).href);
   DEMO_RECORDS.quotations=Array.from({length:50},(_,i)=>({id:'quote-'+i,owner_id:'00000000-0000-0000-0000-0000000000d0',code:'QA-QUOTE-'+i,customer_name:'QA Company',customer_id:'qa-company',contact_id:'qa-person',issue_date:'2026-11-03',valid_until:'2026-11-06',payment_terms:0,payment_term_code:'cash',counterparty_tax_id:'0125568016470',counterparty_address:'119/531 Rattanathibet Road, Nonthaburi',prepared_by_email:'sales@example.test',prepared_by_phone:'021234567',project_name:'Sales',payment_instructions:'50% deposit before delivery',document_language:'en',currency:'THB',prepared_by:i?'Monchai Aukkarapornsiri':'',status:i?'approved':'submitted',approval_status:i?'approved':'pending',items:[{name:'HCI Node',qty:3,unit:'EA',price:700000,total:2100000,discount:0,cost:500000}],subtotal:2100000,discount:0,vat:147000,total:2247000}));
  });
  await openDesktopMenu(page,'Quotations','Quotation List');
  const mine=page.getByRole('button',{name:'My records',exact:true});if(await mine.count()&&await mine.getAttribute('aria-pressed')==='true')await mine.click();
  await page.setViewportSize({width,height:900});
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
   await dialog.waitFor();await page.evaluate(()=>document.fonts.load('300 15px "IBM Plex Sans Thai"'));assert.equal(await dialog.evaluate(el=>el.matches(':modal')),true);
   const box=await dialog.boundingBox();assert.ok(box.y>=0&&box.y+box.height<=901&&box.x>=0&&box.x+box.width<=width+1);
   const hero=await dialog.locator('.kc-quote-hero h2').evaluate(n=>({color:getComputedStyle(n).color,border:getComputedStyle(n).borderBottomWidth,font:getComputedStyle(n).fontFamily}));assert.equal(hero.color,'rgb(18, 60, 70)');assert.equal(hero.border,'0px');assert.match(hero.font,/IBM Plex Sans Thai/);assert.match(hero.font,/sans-serif/);
   const status=await dialog.locator('.kc-quote-header-actions>.kc-quote-detail-status').evaluate(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,x:n.getBoundingClientRect().right,y:n.getBoundingClientRect().top}));assert.equal(await dialog.locator('.kc-quote-header-actions>button').count(),0);assert.ok(status.w<=200&&status.h<48);const identity=await dialog.locator('.kc-quote-detail-identity').boundingBox();assert.ok(Math.abs(status.x-identity.x-identity.width)<2);
   const primary=await dialog.locator('.kc-quote-primary-actions>:is(.kc-quote-print-action,.kc-quote-edit-action)').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,y:n.getBoundingClientRect().top,bg:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color})));assert.equal(primary.length,2);assert.ok(Math.abs(primary[0].w-primary[1].w)<1&&primary[0].h===primary[1].h&&Math.abs(primary[0].y-primary[1].y)<1,JSON.stringify(primary));assert.equal(primary[0].bg,'rgb(8, 138, 135)');assert.equal(primary[1].bg,'rgb(230, 247, 247)');assert.equal(primary[1].color,'rgb(8, 138, 135)');
   assert.ok(await dialog.locator('.kc-quote-card .crm-field>div').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).fontWeight==='300')));assert.equal(await dialog.locator('.kc-quote-card h3').first().evaluate(n=>getComputedStyle(n).fontWeight),'600');
   const closeDepth=await dialog.getByRole('button',{name:'Close quotation details',exact:true}).evaluate(n=>getComputedStyle(n,'::after').filter);assert.match(closeDepth,/drop-shadow/);
   const approvalPanel=dialog.locator('.kc-approval-compact');
   const approvalButtons=await approvalPanel.locator('.kc-approval-actions>button').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,y:n.getBoundingClientRect().y})));
   assert.equal(approvalButtons.length,6);assert.ok(approvalButtons.every(n=>Math.abs(n.w-approvalButtons[0].w)<1&&n.h===44));
   if(width>1000){assert.ok(approvalButtons.every(n=>Math.abs(n.y-approvalButtons[0].y)<1));const bounds=await approvalPanel.evaluate(n=>({height:n.getBoundingClientRect().height,children:[...n.children].map(x=>({class:x.className,h:x.getBoundingClientRect().height,margin:getComputedStyle(x).margin}))}));assert.ok(bounds.height<=190,JSON.stringify(bounds));}
   const iconSlots=await approvalPanel.locator('.kc-approval-action img').evaluateAll(ns=>ns.map(n=>({ok:n.complete&&n.naturalWidth>0,w:n.width,h:n.height})));assert.ok(iconSlots.every(n=>n.ok&&n.w===18&&n.h===18));
   await approvalPanel.getByRole('textbox',{name:'Approval comment',exact:true}).fill('QA approval note');assert.equal(await approvalPanel.getByRole('textbox',{name:'Approval comment',exact:true}).inputValue(),'QA approval note');
   const cards=dialog.locator('.kc-quote-card-grid>.kc-quote-card');assert.equal(await cards.count(),4);
   const sizes=await cards.evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,sw:n.scrollWidth,cw:n.clientWidth})));
   assert.ok(sizes.every(b=>b.sw<=b.cw+1),JSON.stringify(sizes));if(width>760)assert.ok(sizes.every(b=>Math.abs(b.w-sizes[0].w)<1),JSON.stringify(sizes));
   assert.ok((await dialog.innerText()).includes('119/531 Rattanathibet Road'));
   assert.ok((await dialog.innerText()).includes('50% deposit before delivery'));
   assert.ok(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Detail has no horizontal overflow');
   await dialog.screenshot({path:'test-artifacts/quotation-detail-cards-'+code+'-'+width+'.png'});
   await dialog.getByRole('button',{name:'Items and services',exact:true}).click();
   assert.ok((await dialog.innerText()).includes('HCI Node'));
   await dialog.locator('.kc-quote-summary-gp strong').getByText('600,000.00',{exact:true}).waitFor();
   assert.equal(await dialog.locator('.kc-quote-compact-items tbody tr').count(),1);assert.equal(await dialog.locator('.kc-quote-compact-items th').nth(2).evaluate(n=>getComputedStyle(n).textAlign),'left');assert.equal(await dialog.locator('.kc-quote-item-first-line').first().evaluate(n=>getComputedStyle(n).textAlign),'left');
   assert.equal(await dialog.locator('.kc-quote-summary-margin strong').innerText(),'28.57%');assert.equal(await dialog.locator('.kc-quote-summary-cost strong').innerText(),'1,500,000.00');const profitCards=await dialog.locator('.kc-quote-profit-summary article').evaluateAll(ns=>ns.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));assert.equal(profitCards.length,4);assert.ok(profitCards.every(c=>Math.abs(c.w-profitCards[0].w)<1&&Math.abs(c.h-profitCards[0].h)<1));
   assert.equal(await dialog.getByRole('button',{name:'Edit details',exact:true}).isDisabled(),false);
   await dialog.getByRole('button',{name:'Edit details',exact:true}).click();
   await page.getByText(code==='QA-QUOTE-0'?'Withdraw or finish the pending approval before editing':'Approved document editing requires a signed-in account',{exact:true}).waitFor();
   assert.equal(await page.getByRole('dialog',{name:'Quotation form',exact:true}).count(),0,'Approved editing requires a real account and policy check');
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
