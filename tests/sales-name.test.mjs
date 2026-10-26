import test from 'node:test';
import assert from 'node:assert/strict';
import {shortSalesName} from '../src/sales-name.mjs';
import {recordOptionLabel} from '../src/record-display.mjs';
test('sales display retains first name and one surname initial',()=>{
 for(const [full,short] of [['Monchai Aukkarapornsiri','Monchai A.'],['Onjira Suwannasart','Onjira S.'],[' Apichaya   Buahom ','Apichaya B.'],['สมชาย ใจดี','สมชาย ใ.'],['Monchai A.','Monchai A.'],['Monchai','Monchai'],['sales@kai-com.com','sales@kai-com.com'],['','']])assert.equal(shortSalesName(full),short);
});
test('display formatting abbreviates staff fields, preserves customer names and source values',()=>{
 const row={owner_name:'Monchai Aukkarapornsiri',customer_name:'Eternal Resin Co., Ltd.'};
 for(const lang of ['th','en']){assert.equal(recordOptionLabel('contacts','owner_name',row.owner_name,lang),'Monchai A.');assert.equal(recordOptionLabel('opportunities','customer_name',row.customer_name,lang),row.customer_name);}
 assert.equal(row.owner_name,'Monchai Aukkarapornsiri');
});
