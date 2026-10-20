import test from 'node:test';
import assert from 'node:assert/strict';
import {formatCustomerAddress,quotationAddressPatch} from '../src/customer-address.mjs';
const customer={address:'18 Road',billing_city:'District',province:'Bangkok',billing_postal_code:'10160',billing_country:'Thailand'};
test('all five fields are displayed once, including old combined street rows',()=>{
 assert.equal(formatCustomerAddress(customer),'18 Road, District, Bangkok, 10160, Thailand');
 assert.equal(formatCustomerAddress({...customer,address:formatCustomerAddress(customer)}),formatCustomerAddress(customer));
 assert.equal(formatCustomerAddress(), '');
});
test('new and linked drafts follow the master address',()=>{
 assert.deepEqual(quotationAddressPatch({},customer),{counterparty_address:formatCustomerAddress(customer),address_source:'customer'});
 assert.equal(quotationAddressPatch({id:'q',status:'draft',address_source:'customer',counterparty_address:'Old'},customer).counterparty_address,formatCustomerAddress(customer));
 assert.equal(quotationAddressPatch({id:'q',status:'draft',counterparty_address:'Thailand'},customer).address_source,'customer');
});
test('custom, ambiguous legacy and submitted snapshots never change on opening',()=>{
 for(const quotation of [{id:'q',status:'draft',address_source:'custom'}, {id:'q',status:'draft',counterparty_address:'Different branch'}, {id:'q',status:'draft',approval_status:'pending',address_source:'customer'}, {id:'q',status:'sent',address_source:'customer'}, {id:'q',status:'approved',address_source:'customer'}])assert.deepEqual(quotationAddressPatch(quotation,customer),{});
});
