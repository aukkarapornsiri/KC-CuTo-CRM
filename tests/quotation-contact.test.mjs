import {test} from 'node:test';import assert from 'node:assert/strict';
import {quotationContact} from '../src/quotation-contact.mjs';
const q={customer_id:'a',contact_id:'one',contact_name:'Old name'},customer={email:'company@test',phone:'111'};
const contacts=[{id:'one',customer_id:'a',name:'New name',email:'new@test',phone:'222'},{id:'two',customer_id:'a',name:'Primary',is_primary:true,email:'primary@test'}];
test('Selected contact uses latest name phone and email',()=>assert.deepEqual(quotationContact(q,customer,contacts),{name:'New name',phone:'222',email:'new@test'}));
test('No selected contact uses primary; explicit choice is respected',()=>assert.equal(quotationContact({...q,contact_id:''},customer,contacts).name,'Primary'));
test('Another customer and inactive contacts cannot leak into document',()=>assert.deepEqual(quotationContact(q,customer,[{...contacts[0],customer_id:'b'}]),{name:'',phone:'111',email:'company@test'}));
