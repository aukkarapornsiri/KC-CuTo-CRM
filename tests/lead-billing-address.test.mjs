import test from 'node:test';
import assert from 'node:assert/strict';
import {convertDemoLead} from '../src/record-profile.mjs';

test('conversion carries all five billing address parts without duplicating city and province',()=>{
 const lead={id:'lead',company_name:'Example',mailing_street:'18 Example Road',mailing_city:'Nong Khaem',mailing_state:'Bangkok',mailing_postal_code:'10160',mailing_country:'Thailand'};
 const records={leads:[lead],customers:[],contacts:[]};
 convertDemoLead(records,lead.id,()=> 'customer','2026-10-20');
 const c=records.customers[0];
 assert.deepEqual([c.address,c.billing_city,c.province,c.billing_postal_code,c.billing_country],['18 Example Road','Nong Khaem','Bangkok','10160','Thailand']);
});
