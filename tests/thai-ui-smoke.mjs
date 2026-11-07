import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [1440,390]){const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const res=await route.fetch();let s=await res.text();const needle='if(!t)throw new Error("useAppContext must be used inside AppProvider");return t}';assert.ok(s.includes(needle));s=s.replace(needle,'if(!t)throw new Error("useAppContext must be used inside AppProvider");window.QAApp=t;return t}');await route.fulfill({response:res,body:s});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();await page.waitForFunction(()=>window.QAApp?.demoMode);
 const routes=[['dashboard','dashboard'],['leads','lead-inbox'],['customers','customer-list'],['contacts','contact-list'],['opportunities','opp-all'],['quotations','quot-list'],['contracts','con-all'],['assets','asset-all'],['tickets','tk-all'],['activities','act-my'],['documents','doc-all'],['reports','reports'],['ai','ai-summary'],['settings','set-hub']];
 for(const lang of ['th','en','th']){await page.evaluate(lang=>window.QAApp.setLang(lang),lang);await page.waitForFunction(lang=>document.documentElement.lang===lang,lang);
 for(const [module,sub]of routes){await page.evaluate(([m,s])=>window.QAApp.navigate(m,s),[module,sub]);await page.waitForTimeout(150);const ui=await page.locator('body').innerText();assert.ok(ui.length>50);if(lang==='th'){for(const text of ['REPORTS & ANALYTICS','QUOTATION / KC CUTO CRM','Sync Master Data and Product'])assert.ok(!ui.includes(text),module+': '+text);}}
 }
 await page.evaluate(()=>window.QAApp.navigate('settings','set-hub'));await page.screenshot({path:`test-artifacts/thai-settings-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);console.log('PASS all-module language switching',width);await page.close();}}
finally{await browser.close();}
