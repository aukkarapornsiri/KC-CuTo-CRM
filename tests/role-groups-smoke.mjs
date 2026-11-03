import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{for(const width of [390,1440]){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app-C2ITSffc.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+';window.QAReact=KCNumbers.React;window.QACreateRoot=ak.createRoot;'});});
 await page.goto('http://127.0.0.1:4173/?demo=1');await page.waitForFunction(()=>window.QAReact);
 await page.evaluate(async()=>{const React=window.QAReact,{createRolePicker}=await import('./src/role-groups.mjs'),{SI_CUSTOM_ROLE_DEFAULTS}=await import('./src/settings-workspace.mjs');
 const roles=[{role_key:'admin',label_th:'ผู้ดูแลระบบ',label_en:'Administrator',is_system:true},...SI_CUSTOM_ROLE_DEFAULTS];const Picker=createRolePicker(React);
 const host=document.createElement('div');host.id='qa-roles';host.style.cssText='position:fixed;inset:0;overflow:auto;background:#f3f7f8;z-index:99999;padding:16px';document.body.append(host);
 function Harness(){const [value,V]=React.useState('warehouse_officer');return React.createElement('form',{onSubmit:e=>{e.preventDefault();window.unexpectedSubmit=true;}},React.createElement(Picker,{roles,value,onChange:v=>{V(v);window.pickedRole=v;},lang:'th',cards:true}),React.createElement('output',{'aria-label':'Current role'},value));}window.QACreateRoot(host).render(React.createElement(Harness));});
 const root=page.locator('#qa-roles'),group=root.getByRole('combobox',{name:'กลุ่มบทบาท',exact:true}),search=root.getByRole('searchbox',{name:'ค้นหาบทบาท',exact:true}),select=root.getByRole('combobox',{name:'เลือกบทบาท',exact:true});await select.waitFor();
 assert.equal(await group.locator('option').count(),8);assert.ok(await root.locator('.kc-role-groups>details').count()<=7);assert.equal(await select.inputValue(),'warehouse_officer');
 await group.selectOption('solutions');assert.equal(await select.inputValue(),'warehouse_officer');await search.fill('software');assert.equal(await select.inputValue(),'warehouse_officer');await select.selectOption('software_developer');assert.equal(await root.getByLabel('Current role').textContent(),'software_developer');
 await search.fill('no-matching-role');assert.equal(await select.inputValue(),'software_developer');await root.getByRole('status').filter({hasText:'ไม่พบบทบาท'}).waitFor();await search.press('Enter');assert.equal(await page.evaluate(()=>!!window.unexpectedSubmit),false);
 await group.selectOption('all');await search.fill('คลังสินค้า');assert.ok(await select.locator('option[value=warehouse_officer]').count());await select.selectOption('warehouse_officer');await search.fill('');
 for(const cards of await root.locator('.kc-role-groups>details[open] .crm-role-cards').all()){const b=await cards.evaluate(n=>({w:n.clientWidth,sw:n.scrollWidth}));assert.ok(b.sw<=b.w+1,JSON.stringify(b));}
 const bounds=await root.evaluate(n=>({w:n.clientWidth,sw:n.scrollWidth}));assert.ok(bounds.sw<=bounds.w+1,JSON.stringify(bounds));await root.screenshot({path:`test-artifacts/grouped-roles-${width}.png`});assert.deepEqual(errors,[]);await page.close();console.log('PASS grouped roles',width);
}}finally{await browser.close();}
