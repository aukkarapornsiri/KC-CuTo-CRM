import test from 'node:test';import assert from 'node:assert/strict';
import {systemLabel,systemStatus,systemMessage} from '../src/ui-language.mjs';
import {recordOptionLabel} from '../src/record-display.mjs';
import {createQuotationDetail} from '../src/quotation-detail.mjs';
test('system labels and errors follow language without changing unknown data',()=>{
 assert.equal(systemLabel('Engineer','th'),'วิศวกร');assert.equal(systemLabel('Engineer','en'),'Engineer');assert.equal(systemStatus('repairing','th'),'กำลังซ่อม');
 for(const text of ['ACME International Co., Ltd.','Custom warehouse','English note: keep exact case','Dell Latitude 7450'])assert.equal(systemLabel(text,'th'),text);
 assert.equal(systemMessage('Invalid login credentials','th'),'อีเมลหรือรหัสผ่านไม่ถูกต้อง');assert.equal(systemMessage('Invalid login credentials','en'),'Invalid login credentials');assert.match(systemMessage('unexpected internal failure','th'),/[ก-๙]/);
 assert.equal(recordOptionLabel('customers','name','Active','th'),'Active');assert.equal(recordOptionLabel('leads','note','High priority customer','th'),'High priority customer');assert.equal(recordOptionLabel('activities','status','completed','th'),'เสร็จสิ้น');
});
test('Thai quotation labels preserve English product data and English view',()=>{
 const row={id:'qa',subtotal:1000,discount:0,vat:70,total:1070,items:[{name:'Original English Product',part_number:'PN-TEST',qty:1,price:1000,total:1000,unit:'Box'}]};
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:()=>[{id:'qa',data:{cost_total:700,gp_amount:300,gp_margin:30}},()=>{}],useEffect:()=>{}};
 const C=createQuotationDetail({React,client:{}});const thai=JSON.stringify(C({row,lang:'th',canViewFinancials:true})),english=JSON.stringify(C({row,lang:'en',canViewFinancials:true}));
 for(const data of ['Original English Product','PN-TEST','Box']){assert.ok(thai.includes(data));assert.ok(english.includes(data));}
 assert.ok(thai.includes('ต้นทุนรวม'));assert.ok(thai.includes('กำไรขั้นต้น'));assert.ok(thai.includes('อัตรากำไร'));assert.ok(!thai.includes('% Margin'));assert.ok(english.includes('Total cost'));assert.ok(english.includes('% Margin'));
});
