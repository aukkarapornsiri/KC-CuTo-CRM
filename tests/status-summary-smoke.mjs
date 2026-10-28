import assert from 'node:assert/strict';import {chromium} from 'playwright';import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}: {})});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/?demo=1');await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
 await page.evaluate(async()=>{const source=await(await fetch([...document.scripts].find(s=>s.src.includes('app-C2ITSffc')).src)).text();const uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];const {DEMO_RECORDS:r}=await import(new URL(uri,location.href).href);for(const entity of ['leads','contacts','customers'])r[entity]=['ALPHA','BETA'].map((name,i)=>({id:entity+i,code:'SUMMARY-'+name,name:'SUMMARY-'+name,company_name:'SUMMARY-'+name,contact_name:'SUMMARY-'+name,status:({leads:['new','assign'],contacts:['active','inactive'],customers:['Active','Prospect']})[entity][i]}));});
 const open=async(parent,child)=>{if(width>=1024)return openDesktopMenu(page,parent,child);await page.locator('button.lg\\:hidden').first().click();const nav=page.locator('div.fixed.top-0.left-0.h-full.w-64.lg\\:hidden');if(!await nav.getByText(child,{exact:true}).isVisible())await nav.getByText(parent,{exact:true}).click();await nav.getByText(child,{exact:true}).click();};
 for(const [parent,child,entity]of [['Leads','Lead Inbox','leads'],['Contacts','Contact List','contacts'],['Accounts','Account List','customers']]){
  await open(parent,child);const root=page.locator(`[data-entity=${entity}]`),summary=root.locator('.crm-status-metrics');await summary.waitFor();await page.waitForFunction(entity=>document.querySelector(`[data-entity=${entity}] [data-summary-status=total] p`)?.textContent==='2',entity);
  assert.equal(await summary.locator('[data-summary-status=total] p').innerText(),'2');assert.equal(await summary.locator('[data-summary-status]:not([data-summary-status=total]) p').evaluateAll(nodes=>nodes.reduce((n,x)=>n+Number(x.textContent),0)),2);
  const cards=await summary.locator('.crm-master-form').evaluateAll(nodes=>nodes.map(x=>({x:x.getBoundingClientRect().x,width:x.getBoundingClientRect().width})));for(const c of cards)assert.ok(c.x>=0&&c.x+c.width<=width+1,'Card fits viewport');
  await root.locator('input[type=search]').first().fill('SUMMARY-ALPHA');await page.waitForFunction(entity=>document.querySelector(`[data-entity=${entity}] [data-summary-status=total] p`)?.textContent==='1',entity);await root.locator('input[type=search]').first().fill('');
  await summary.screenshot({path:`test-artifacts/status-summary-${entity}-${width}.png`});
 }
 assert.deepEqual(errors,[]);console.log('PASS status summary counts, search and responsive cards',width);await page.close();
}}finally{await browser.close();}
