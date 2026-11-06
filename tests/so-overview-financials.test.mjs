
import test from 'node:test';import assert from 'node:assert/strict';
import {orderFinancialSummaries,filterOrders} from '../src/sales-order-view.mjs';
const row=(id,subtotal=1000,currency='THB')=>({id,subtotal,discount:100,vat:63,total:963,currency});
test('summary covers every filtered order, discount and weighted GP',()=>{
 const rows=Array.from({length:80},(_,i)=>row(String(i))),financials=Object.fromEntries(rows.map(r=>[r.id,{cost_total:700}]));
 const [f]=orderFinancialSummaries(rows,financials,true);assert.equal(f.sales,72000);assert.equal(f.cost,56000);assert.equal(f.gp,16000);assert.equal(f.margin,16000/72000*100);assert.equal(f.vat,5040);
 assert.equal(orderFinancialSummaries(filterOrders(rows,{query:'missing'}),financials,true)[0].sales,0);
});
test('unknown or unauthorized costs never show partial profit',()=>{
 const rows=[row('1'),row('2')];
 assert.equal(orderFinancialSummaries(rows,{'1':{cost_total:700}},true)[0].cost,null);
 assert.equal(orderFinancialSummaries(rows,{'1':{cost_total:700}},true)[0].gp,null);
 const hidden=orderFinancialSummaries(rows,{'1':{cost_total:700},'2':{cost_total:700}},false)[0];assert.equal(hidden.cost,null);assert.equal(hidden.gp,null);assert.equal(hidden.margin,null);
 assert.equal(orderFinancialSummaries([row('1')],{'1':{cost_total:0}},true)[0].cost,0);
 assert.equal(orderFinancialSummaries([{id:'1',total:100}],{},true)[0].sales,null);
});
test('currencies remain separate and margin has no zero denominator',()=>{
 const groups=orderFinancialSummaries([row('1'),row('2',2000,'USD')],{'1':{cost_total:700},'2':{cost_total:1800}},true);
 assert.deepEqual(groups.map(f=>[f.currency,f.sales,f.cost]),[['THB',900,700],['USD',1900,1800]]);
 assert.equal(orderFinancialSummaries([{...row('1'),subtotal:100}],{'1':{cost_total:0}},true)[0].margin,null);
});
