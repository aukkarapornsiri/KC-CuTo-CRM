import assert from 'node:assert/strict';
import {applyCompanyQuotationDefaults,applyQuotationBranding} from '../src/quotation-company.mjs';
const template={logo_url:'ribbon.png',company_phone:'old'};
const company={logo_url:'company.png',company_name:'Company',company_details:{sales_name:'Sales Team',sales_phone:'021234567',sales_email:'sales@example.com',sales_line:'@kaicom'}};
const next=applyCompanyQuotationDefaults(template,company);
assert.equal(next.company_logo_url,'company.png');assert.equal(next.logo_url,'ribbon.png');assert.equal(next.sales_name,'Sales Team');assert.equal(next.company_phone,'021234567');assert.equal(next.company_email,'sales@example.com');assert.equal(next.sales_line,'@kaicom');assert.equal(template.company_phone,'old');assert.equal(JSON.parse(JSON.stringify(next)).sales_line,'@kaicom');
console.log('PASS company branding, sales contact and immutable quotation snapshot');
const stored=applyCompanyQuotationDefaults({...template,id:'saved',company_name_th:'Saved Name',company_phone:'Saved Phone',company_email:''},company);
assert.equal(stored.company_name_th,'Saved Name');assert.equal(stored.company_phone,'Saved Phone');assert.equal(stored.company_email,'');assert.equal(stored.company_logo_url,'company.png');
console.log('PASS saved quotation company fields and deliberate blanks override central defaults');

const snapshot={company_name_th:'Saved customer-facing company',company_logo_url:'old-left',logo_url:'old-right',logo_storage_key:'old-key',seller_signature_url:'signature'};
const branded=applyQuotationBranding(snapshot,{logo_url:'gold-ts'},{logo_storage_key:'kaicom'});
assert.equal(branded.company_logo_url,'gold-ts');assert.equal(branded.logo_storage_key,'kaicom');assert.equal(branded.logo_url,'');assert.equal(branded.company_name_th,snapshot.company_name_th);assert.equal(branded.seller_signature_url,'signature');assert.equal(snapshot.company_logo_url,'old-left');
assert.equal(applyQuotationBranding(snapshot,{logo_url:'gold-ts'},{logo_url:'new-right'}).logo_storage_key,'');
console.log('PASS shared two-logo defaults on existing snapshots without rewriting business fields');
