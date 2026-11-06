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
test('quotation edit deep link selects the exact request instead of another document workflow',async()=>{
 const effects=[],states=[],queries=[];let state=0;
 const request={id:'request-id',quotation_id:'quote-id',before_snapshot:{code:'SQ-EXACT'},status:'pending',approver_ids:['reviewer'],current_step:1,requested_by:'seller',reason:'Correct address'};
 const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useRef:v=>({current:v}),useState:v=>{const i=state++;return [typeof v==='function'?v():v,x=>states.push({i,x})];},useEffect:f=>effects.push(f)};
 const client={from:table=>({select:()=>({eq:(key,id)=>({maybeSingle:async()=>{queries.push({table,key,id});return {data:request};}})})})};
 const Center=createApprovalCenter({React,client,useApp:()=>({profile:{id:'reviewer'},demoMode:false}),useAccess:()=>({can:()=>true}),records:{}});
 Center({lang:'en',initialRecordId:'request-id',initialKind:'quotation_edit'});
 // The second effect resolves a notification destination, independently of inbox loading.
 effects[1]();await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(queries,[{table:'crm_quotation_edit_requests',key:'id',id:'request-id'}]);
 assert.equal(states.find(s=>s.i===4)?.x.request.id,'request-id');
});
test('bell auto-opens only the current independent reviewer task once loading finishes',()=>{
 for(const enabled of [true,false]){
 const effects=[],selected=[],row={kind:'so',id:'so-ready',status:'pending',orderStatus:'confirmed',request:{status:'pending',requested_by:'seller',current_step:1,approver_ids:['reviewer']}};let state=0;
 const rows=[{...row,id:'wrong-reviewer',request:{...row.request,approver_ids:['other']}},row];
 const R={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useRef:v=>({current:v}),useEffect:f=>effects.push(f),useState:v=>{const i=state++;return [i===0?rows:i===7?false:typeof v==='function'?v():v,x=>{if(i===4)selected.push(x);}];}};
 const C=createApprovalCenter({React:R,client:{},useApp:()=>({profile:{id:'reviewer'}}),useAccess:()=>({can:()=>true}),records:{}});
 C({lang:'en',autoOpenPending:enabled});effects.at(-1)();effects.at(-1)();assert.deepEqual(selected,enabled?[row]:[]);
 }
});
test('SO approval button uses the guarded SO RPC with the reviewer profile signature',async()=>{
 const original=globalThis.window;globalThis.window={dispatchEvent(){}};
 try{const f=fixture('so');nodes(f.tree).find(n=>n.type==='button'&&n.children.includes('Approve SO')).props.onClick();await new Promise(r=>setTimeout(r,30));assert.deepEqual(f.calls,[{name:'crm_so_approval_action',args:{p_sales_order_id:'record-id',p_action:'approve',p_note:'Reviewed'}}]);}finally{globalThis.window=original;}
});
