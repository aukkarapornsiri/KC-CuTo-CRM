import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canReviewQuotation,approvalCategory} from '../src/approval-center.mjs';
test('only the current policy approver can decide and self approval stays denied',()=>{
 const r={status:'pending',current_step:2,approver_ids:['first','second'],submitted_by:'seller',snapshot:{owner_id:'owner'}};
 assert.equal(canReviewQuotation(r,'second',true),true);
 for(const user of ['first','seller','owner','other'])assert.equal(canReviewQuotation(r,user,true),false);
 assert.equal(canReviewQuotation(r,'second',false),false);
 assert.equal(canReviewQuotation({...r,status:'approved'},'second',true),false);
 assert.equal(canReviewQuotation({...r,submitted_by:'second'},'second',true),false);
 assert.equal(canReviewQuotation({...r,snapshot:{owner_id:'second'}},'second',true),false);
});
test('work categories distinguish quotations, SO, services and future modules',()=>{
 assert.equal(approvalCategory('quotations'),'quotation');assert.equal(approvalCategory('crm_sales_orders'),'so');assert.equal(approvalCategory('tickets'),'service');assert.equal(approvalCategory('contracts'),'other');
});

import {createApprovalCenter} from '../src/approval-center.mjs';
const nodes=tree=>{const result=[];function visit(n){if(!n||typeof n!=='object')return;result.push(n);for(const c of n.children||[])visit(c);}visit(tree);return result;};
function fixture(kind,comment='Reviewed'){
 const calls=[],errors=[];let state=0;
 const request={status:'pending',current_step:1,approver_ids:['reviewer'],submitted_by:'seller',snapshot:{owner_id:'seller'}};
 const selected={kind,id:'record-id',status:'pending',orderStatus:'confirmed',request,items:[]};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useEffect:()=>{},useRef:value=>({current:value}),useState:value=>{const index=state++;return [index===4?selected:index===5?comment:typeof value==='function'?value():value,v=>{if(index===8)errors.push(v);}];}};
 const client={from:table=>{const q=new Proxy({then(resolve){resolve({data:table==='crm_sales_signature_defaults'?{storage_key:'reviewer/signature.png'}:[],error:null});}},{get(target,key){return key==='then'?target.then:()=>q;}});return q;},rpc:async(name,args)=>{calls.push({name,args});await new Promise(resolve=>setTimeout(resolve,5));return {data:{},error:null};}};
 const Center=createApprovalCenter({React,client,useApp:()=>({profile:{id:'reviewer'},demoMode:false}),useAccess:()=>({can:()=>true}),records:{}});
 return {tree:Center({lang:'en'}),calls,errors};
}
test('quotation decision uses policy RPC and blocks double submission',async()=>{
 const original=globalThis.window;globalThis.window={dispatchEvent:()=>{}};
 try{const f=fixture('quotation');const approve=nodes(f.tree).find(n=>n.type==='button'&&n.children.includes('Approve this step'));approve.props.onClick();approve.props.onClick();await new Promise(r=>setTimeout(r,30));assert.deepEqual(f.calls,[{name:'crm_quotation_transition',args:{p_quotation:'record-id',p_action:'approve',p_comment:'Reviewed'}}]);}finally{globalThis.window=original;}
});
test('SO rejection requires a reason and uses the SO decision RPC',async()=>{
 const original=globalThis.window;globalThis.window={dispatchEvent:()=>{}};
 try{const empty=fixture('so','');nodes(empty.tree).find(n=>n.type==='button'&&n.children.includes('Reject')).props.onClick();assert.equal(empty.calls.length,0);assert.ok(empty.errors.includes('Enter a rejection reason'));const f=fixture('so','Incorrect PO');nodes(f.tree).find(n=>n.type==='button'&&n.children.includes('Reject')).props.onClick();await new Promise(r=>setTimeout(r,30));assert.deepEqual(f.calls,[{name:'crm_so_approval_action',args:{p_sales_order_id:'record-id',p_action:'reject',p_note:'Incorrect PO'}}]);}finally{globalThis.window=original;}
});
