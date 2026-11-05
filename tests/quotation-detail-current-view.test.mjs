import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createQuotationDetail} from '../src/quotation-detail.mjs';
const row={id:'quote',subtotal:1000,discount:100,vat:63,total:963,currency:'THB',items:[{name:'First line\nExtra detail',part_number:'KC-TEST',qty:1,unit:'unit',price:1000,total:1000}]};
const financial={cost_total:700,gp_amount:200,gp_margin:22.22,line_financials:[{gp:200,margin:22.22}]};
function render({canViewFinancials=true,data=financial,error=false,lang='en'}={}){
 const effects=[],queries=[];
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:()=>[{id:row.id,data,error},()=>{}],useEffect:f=>effects.push(f)};
 const client={from:table=>{queries.push(table);return {select:()=>({eq:()=>({maybeSingle:async()=>({data})})})};}};
 const tree=createQuotationDetail({React,client})({row,lang,canViewFinancials});
 effects.forEach(f=>f());
 return {tree,text:JSON.stringify(tree),queries};
}
test('current item view shows first line, part number, net sales and weighted margin',()=>{const {tree,text}=render();assert.equal(tree.props.className,'kc-quote-compact-items');assert.equal(tree.props.id,'crm-quotation-print');for(const value of ['KC-TEST','First line','900.00','200.00','22.22%','963.00'])assert.ok(text.includes(value));assert.ok(!text.includes('Extra detail'));});
test('financial permission suppresses cost reads and displayed GP',()=>{const {text,queries}=render({canViewFinancials:false});assert.deepEqual(queries,[]);assert.ok(!text.includes('200.00'));assert.ok(!text.includes('22.22%'));});
test('inconsistent and failed cost data keep placeholders and localized notice',()=>{assert.ok(render({data:{...financial,gp_amount:900}}).text.includes('costs are complete'));assert.ok(render({data:null,error:true}).text.includes('Unable to load costs'));assert.ok(render({data:null,lang:'th'}).text.includes('GP และ Margin'));});
