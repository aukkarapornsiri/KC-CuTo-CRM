import test from 'node:test';
import assert from 'node:assert/strict';
import {createSalesOrders} from '../src/sales-orders.mjs';
function render(lang,status){
 let index=0;
 const row={id:'qa',code:'SO-QA',status:'confirmed',customer_name:'Synthetic',po_number:'PO-QA',created_at:'2026-01-01',total:100,currency:'THB'};
 const overrides={0:[row],4:false,13:{qa:{status}}};
 const React={createElement:(type,props,...children)=>({type,props,children}),useState:init=>{const i=index++;return [Object.hasOwn(overrides,i)?overrides[i]:init,()=>{}]},useRef:value=>({current:value}),useEffect:()=>{}};
 const Component=createSalesOrders({React,client:{},useApp:()=>({demoMode:true,profile:{id:'qa'}}),useAccess:()=>({can:()=>true}),records:{}});
 const text=node=>node==null?'':typeof node==='object'?(Array.isArray(node)?node:node.children||[]).map(text).join(' '):String(node);
 return text(Component({lang}));
}
test('SO list approval labels follow TH/EN without exposing raw status',()=>{
 for(const [status,th,en] of [['pending','รออนุมัติ','Pending'],['approved','อนุมัติแล้ว','Approved'],['rejected','ไม่อนุมัติ','Rejected']]){
 assert.ok(render('th',status).includes('อนุมัติ SO: '+th));assert.ok(render('en',status).includes('SO approval: '+en));
 }
});
