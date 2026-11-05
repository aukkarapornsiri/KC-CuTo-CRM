import assert from 'node:assert/strict';import {chromium} from 'playwright';import {openDesktopMenu} from './menu-helper.mjs';
const browser=await chromium.launch({headless:true});
try{for(const width of [1440,390]){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.SITE_URL||'http://127.0.0.1:4173/?demo=1');await page.getByRole('button',{name:'เข้าใช้งานโหมดทดลอง',exact:true}).click();await page.getByRole('button',{name:'เปลี่ยนเป็นภาษาอังกฤษ',exact:true}).click();
 await page.evaluate(async()=>{const source=await(await fetch([...document.scripts].find(x=>x.src.includes('app-C2')).src)).text(),uri=source.match(/from ['"]([^'"]*internal-workspace\.mjs[^'"]*)['"]/)[1];const {DEMO_RECORDS:d}=await import(new URL(uri,location.href).href);window.qaRecords=d;d.leads=[{id:'lead-a',code:'LD-QA-1',company_name:'UNITED FLOUR MILL PUBLIC COMPANY LIMITED',contact_name:'Shared Contact',last_name:'Contact',email:'same@example.test',status:'new',source:'Website',owner_id:'other-owner',owner_name:'Other Sales',created_at:'2026-10-01',updated_at:'2026-10-01'}];d.lead_resolutions=[];});
 await openDesktopMenu(page,'Leads');await page.setViewportSize({width,height:1000});
 const form=page.getByRole('form',{name:'Record form'}),detail=page.getByRole('dialog',{name:'Lead Detail',exact:true});
 async function draft(company){await page.getByRole('button',{name:'Add record',exact:true}).click();await form.waitFor();await form.getByLabel('Company name',{exact:true}).fill(company);await form.getByLabel('Last Name',{exact:true}).fill('Contact');await form.getByLabel('Email',{exact:true}).fill('same@example.test');await form.getByRole('button',{name:'Save',exact:true}).click();await form.getByRole('region',{name:'Duplicate lead review'}).waitFor();}
 await draft('METRO CO., LTD');let review=form.getByRole('region',{name:'Duplicate lead review'});
 assert.match(await review.innerText(),/Matching email/);await review.getByRole('button',{name:'Confirm different company and save',exact:true}).click();await detail.waitFor();assert.equal(await page.evaluate(()=>window.qaRecords.leads.length),2);
 await detail.getByRole('button',{name:'Close detail',exact:true}).click();
 await draft('METRO CO., LTD');review=form.getByRole('region',{name:'Duplicate lead review'});
 assert.equal(await review.getByRole('button',{name:'Confirm different company and save',exact:true}).isDisabled(),true);
 assert.equal(await review.getByRole('button',{name:'Merge leads',exact:true}).isEnabled(),true);assert.equal(await review.getByRole('button',{name:'Submit for review',exact:true}).count(),0);await review.screenshot({path:`test-artifacts/lead-company-same-owner-${width}.png`});await review.getByRole('button',{name:'Merge leads',exact:true}).click();await detail.waitFor();assert.equal(await page.evaluate(()=>window.qaRecords.leads.length),2);assert.equal(await page.evaluate(()=>window.qaRecords.lead_resolutions.filter(r=>r.action==='merge').length),1);
 await detail.getByRole('button',{name:'Close detail',exact:true}).click();
 await draft('UNITED FLOUR MILL PUBLIC COMPANY LIMITED');review=form.getByRole('region',{name:'Duplicate lead review'});
 assert.equal(await review.getByRole('button',{name:'Confirm different company and save',exact:true}).isDisabled(),true);await review.getByLabel('Duplicate reason').fill('Cross sales enquiry');assert.equal(await review.getByRole('button',{name:'Request merge approval',exact:true}).isDisabled(),true);assert.equal(await page.evaluate(()=>window.qaRecords.lead_resolutions.filter(r=>r.action==='merge').length),1);await review.screenshot({path:`test-artifacts/lead-company-cross-owner-${width}.png`});
 assert.deepEqual(errors,[]);console.log('PASS contact-only save, same-owner merge, cross-owner approval guard',width);await page.close();
}}finally{await browser.close();}
