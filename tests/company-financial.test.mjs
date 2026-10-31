import test from 'node:test';import assert from 'node:assert/strict';
import {juristicTaxId,validateCompanyProvider,formatCompanyAmount} from '../src/company-financial-model.mjs';
import {normalizeCompanyFinancialPayload} from '../supabase/functions/_shared/company-financial-payload.mjs';
const digits='010555000001',sum=[...digits].reduce((n,x,i)=>n+Number(x)*(13-i),0),id=digits+(11-sum%11)%10;
const statement={fiscal_year:2025,statement_scope:'standalone',period_start:'2025-01-01',period_end:'2025-12-31',revenue:'1000000.01',net_profit:'-500.25',assets:'900.00',equity:'-100.00'};
const payload={tax_id:id,company_name:'Synthetic QA',currency:'THB',amount_unit:'baht',year_calendar:'gregorian',source_provider:'licensed-test',source_reference:'ref',source_as_of:'2026-10-31',registered_capital:'1000000',statements:[statement]};
test('juristic ID preserves leading zeros and rejects personal, checksum and mixed text',()=>{
 assert.equal(juristicTaxId(id),id);assert.equal(juristicTaxId(' '+id.slice(0,3)+'-'+id.slice(3)+' '),id);
 for(const value of ['123','0000000000000',id.slice(0,12)+(Number(id[12])+1)%10,'abc'+id,'1'+id.slice(1)])assert.equal(juristicTaxId(value),null);
 assert.equal(validateCompanyProvider('dbd_bdex'),'dbd_bdex');assert.throws(()=>validateCompanyProvider('https://arbitrary.example'));
});
test('normalized payload keeps decimal strings, loss and missing amounts distinct',()=>{
 const r=normalizeCompanyFinancialPayload(payload,id);assert.equal(r.profile.registered_capital,'1000000');assert.equal(r.statements[0].revenue,'1000000.01');assert.equal(r.statements[0].net_profit,'-500.25');assert.equal(r.statements[0].expenses,null);assert.equal(r.statements[0].equity,'-100.00');
});
test('wrong entity, unit, year, duplicate scope, period and invalid amounts fail closed',()=>{
 for(const change of [{tax_id:'0000000000000'},{currency:'USD'},{amount_unit:'thousand_baht'},{year_calendar:'buddhist'},{source_reference:''},{statements:[{...statement,fiscal_year:2568}]},{statements:[statement,statement]},{statements:[{...statement,period_end:'2024-01-01'}]},{statements:[{...statement,assets:'-1'}]},{statements:[{...statement,revenue:'1,000'}]},{statements:[{...statement,net_profit:0.1}]},{source_as_of:'2026-02-30'}])assert.throws(()=>normalizeCompanyFinancialPayload({...payload,...change},id));
 assert.throws(()=>normalizeCompanyFinancialPayload(payload,'other'));
});

test('large financial amounts keep exact cents when formatted',()=>{assert.equal(formatCompanyAmount('9999999999999999999999.99'),'9,999,999,999,999,999,999,999.99');assert.equal(formatCompanyAmount(null),'—');assert.equal(formatCompanyAmount('-500.25'),'-500.25');assert.equal(formatCompanyAmount('-0.25'),'-0.25');});
