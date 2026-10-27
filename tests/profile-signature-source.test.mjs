import test from 'node:test';
import assert from 'node:assert/strict';
import {loadProfileSignature} from '../src/profile-signature.mjs';
import {demoSignatureDefaults} from '../src/quotation-seller-signature.mjs';
test('Profile signature source keeps owner scope and empty/default contracts',async()=>{
 for(const key of ['', 'alice/seller-signature-test.png']){
  const client={from(table){assert.equal(table,'crm_sales_signature_defaults');return {select(columns){assert.equal(columns,'storage_key');return {eq(field,owner){assert.equal(field,'user_id');assert.equal(owner,'alice');return {maybeSingle:async()=>({data:key?{storage_key:key}:null,error:null})};}};}};}};
  assert.deepEqual(await loadProfileSignature(client,'alice'),{seller_signature_storage_key:key,seller_signature_owner_id:'alice'});
 }
});
test('signature demo is isolated and denied reads propagate without fabricated defaults',async()=>{
 const value={seller_signature_url:'data:image/png;base64,TEST',seller_signature_owner_id:'qa'};demoSignatureDefaults.set('qa',value);
 try{assert.equal(await loadProfileSignature(null,'qa',true),value);assert.deepEqual(await loadProfileSignature(null,'other',true),{});}finally{demoSignatureDefaults.delete('qa');}
 const denied={message:'denied',code:'42501'};
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({error:denied})})})})};
 await assert.rejects(()=>loadProfileSignature(client,'qa'),e=>e===denied);
});
