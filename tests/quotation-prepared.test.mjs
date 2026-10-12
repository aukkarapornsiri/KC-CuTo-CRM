import test from 'node:test';
import assert from 'node:assert/strict';
import {quotationPreparedRows} from '../src/quotation-prepared.mjs';
test('empty preparer fields are omitted, including absent credit terms',()=>{
 assert.deepEqual(quotationPreparedRows({prepared_by:'  ',reference_document:'—',project_name:'-'}),[]);
});
test('the same normalized preparer and salesperson prints once',()=>{
 const rows=quotationPreparedRows({prepared_by:'Monchai Aukkarapornsiri',owner_name:' monchai  AUKKARAPORNSIRI ',reference_document:'',prepared_by_phone:'123'}, {},'en');
 assert.deepEqual(rows,[['Prepared phone','123'],['Prepared by','Monchai Aukkarapornsiri']]);
});
test('different people and populated reference remain visible',()=>{
 const rows=quotationPreparedRows({prepared_by:'A',owner_name:'B',reference_document:'RF-123',payment_terms:0},{},'en');
 assert.ok(rows.some(([label,value])=>label==='Salesperson'&&value==='B'));
 assert.ok(rows.some(([label,value])=>label==='Reference'&&value==='RF-123'));
 assert.ok(rows.some(([label])=>label==='Credit (days)'));
});
test('salesperson is retained when preparer is absent',()=>{
 assert.deepEqual(quotationPreparedRows({owner_name:'Sales A'},{},'en'),[['Salesperson','Sales A']]);
});
