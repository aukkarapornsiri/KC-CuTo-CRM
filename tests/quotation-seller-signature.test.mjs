import test from 'node:test';
import assert from 'node:assert/strict';
import {applySellerSignature,signatureFields} from '../src/quotation-seller-signature.mjs';
test('signature changes preserve document branding and do not mutate saved snapshots',()=>{
 const old={id:'quote',template_snapshot:{logo_storage_key:'logo',seller_signature_storage_key:'old'}};
 const next=applySellerSignature(old,{seller_signature_storage_key:'user/seller-signature-new.png',seller_signature_owner_id:'user'});
 assert.equal(old.template_snapshot.seller_signature_storage_key,'old');assert.equal(next.template_snapshot.logo_storage_key,'logo');assert.equal(next.template_snapshot.seller_signature_storage_key,'user/seller-signature-new.png');
 assert.equal(applySellerSignature(next,{}).template_snapshot.seller_signature_storage_key,'');
});
test('signature fields do not override other template or user data',()=>{
 assert.deepEqual(signatureFields({company_name:'wrong',user_id:'other',seller_signature_storage_key:'key'}),{seller_signature_storage_key:'key',seller_signature_url:'',seller_signature_owner_id:''});
});
import {createSellerSignatureHook} from '../src/quotation-seller-signature.mjs';
function harness(record){let editing=record,calls=0;const effects=[];const React={createElement:(type,props,...children)=>({type,props,children}),useState:x=>[x,()=>{}],useRef:x=>({current:x}),useEffect:f=>effects.push(f)};const client={from:()=>{calls++;return {select:()=>({eq:(key,id)=>{assert.equal(key,'user_id');assert.equal(id,'me');return {maybeSingle:async()=>({data:{storage_key:'me/seller-signature-default.png'}})};}})}}};const hook=createSellerSignatureHook({React,client});hook({editing,setEditing:f=>editing=f(editing),profile:{id:'me'},demoMode:false,ready:true,lang:'en',busy:false});return {run:async()=>{effects.forEach(f=>f());await new Promise(resolve=>setTimeout(resolve,0));return {editing,calls};}};}
test('new own quotations load only own default',async()=>{const {editing,calls}=await harness({owner_id:'me',template_snapshot:{logo_url:'logo'}}).run();assert.equal(calls,1);assert.equal(editing.template_snapshot.seller_signature_storage_key,'me/seller-signature-default.png');assert.equal(editing.template_snapshot.logo_url,'logo');});
test('saved quotations retain their signature without querying defaults',async()=>{const {editing,calls}=await harness({id:'saved',owner_id:'me',template_snapshot:{seller_signature_storage_key:'old'}}).run();assert.equal(calls,0);assert.equal(editing.template_snapshot.seller_signature_storage_key,'old');});
test('another salesperson never receives current user default',async()=>{const {editing,calls}=await harness({owner_id:'other',template_snapshot:{seller_signature_storage_key:'global'}}).run();assert.equal(calls,0);assert.equal(editing.template_snapshot.seller_signature_storage_key,'');});
test('checkbox omits and restores signature without changing saved default or branding',async()=>{
 let editing={id:'saved',owner_id:'me',template_snapshot:{logo_url:'logo',seller_signature_storage_key:'me/sign.png',seller_signature_owner_id:'me'}};
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:x=>[x,()=>{}],useRef:x=>({current:x}),useEffect:()=>{}};
 const hook=createSellerSignatureHook({React,client:{from:()=>{throw Error('Default must not be modified');}}});
 const {control}=hook({editing,setEditing:f=>editing=f(editing),profile:{id:'me'},ready:true,lang:'en',busy:false});
 function find(n){if(n?.props?.type==='checkbox')return n;for(const c of n?.children||[]){const x=find(c);if(x)return x;}}
 const checkbox=find(control);assert.equal(checkbox.props.checked,true);
 checkbox.props.onChange({target:{checked:false}});assert.equal(editing.template_snapshot.seller_signature_storage_key,'');assert.equal(editing.template_snapshot.logo_url,'logo');
 checkbox.props.onChange({target:{checked:true}});await new Promise(r=>setTimeout(r,0));assert.equal(editing.template_snapshot.seller_signature_storage_key,'me/sign.png');
});

test('quotation signature control has no upload input or default writer',()=>{
 const nodes=[];const React={createElement:(type,props,...children)=>{const n={type,props,children};nodes.push(n);return n;},useState:x=>[x,()=>{}],useRef:x=>({current:x}),useEffect:()=>{}};
 createSellerSignatureHook({React,client:{}})({editing:{owner_id:'me'},setEditing(){},profile:{id:'me'},ready:true,lang:'en',busy:false});
 assert.equal(nodes.filter(n=>n.type==='input'&&n.props?.type==='file').length,0);
 assert.equal(nodes.filter(n=>n.type==='input'&&n.props?.type==='checkbox').length,1);
});
