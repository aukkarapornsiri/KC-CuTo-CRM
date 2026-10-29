import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterAccounts,safeAccountWebsite} from '../src/account-list-view.mjs';
const rows=[{id:'a',name:'Zulu',owner_id:'u',status:'Active',billing_city:'Bangkok',created_at:'2026-09-29T10:00:00Z'},{id:'b',name:'Alpha',owner_id:'v',status:'Prospect',created_at:'2026-09-01T10:00:00Z'}];
test('account views filter and sort without mutating source',()=>{assert.deepEqual(filterAccounts(rows).map(x=>x.id),['a','b']);assert.equal(rows[0].id,'a');for(const opts of [{view:'mine',ownerId:'u'},{query:'Bangkok'},{view:'week',now:new Date('2026-09-30T10:00:00Z')},{view:'active'}])assert.deepEqual(filterAccounts(rows,opts).map(x=>x.id),['a']);assert.deepEqual(filterAccounts(rows,{view:'recent',recentIds:['a','b']}).map(x=>x.id),['a','b']);assert.equal(filterAccounts(rows,{view:'mine'}).length,0);});
test('website links accept web URLs and reject executable or credential URLs',()=>{assert.equal(safeAccountWebsite('example.com'),'https://example.com/');for(const url of ['javascript:alert(1)','data:text/html,<script>','https://user:pass@example.com','not a url'])assert.equal(safeAccountWebsite(url),null);});

test('initial account list renders its newest-first label in both languages',async()=>{
 const {createAccountList}=await import('../src/account-list-view.mjs');
 const React={createElement:(tag,props,...children)=>({tag,props,children}),useState:value=>[value,()=>{}],useRef:()=>({current:null}),useEffect:()=>{}};
 const List=createAccountList({React});
 for(const lang of ['th','en']){const tree=List({lang,rows,loaded:true,busy:false,profile:{id:'u'},route:'customer-list',can:()=>false});assert.ok(JSON.stringify(tree).includes(lang==='th'?'ใหม่ล่าสุดก่อน':'Newest first'));}
});

test('account names open 360 on double click, keyboard activation or touch, not a mouse single click',async()=>{
 const {createAccountList}=await import('../src/account-list-view.mjs');
 const React={createElement:(tag,props,...children)=>({tag,props,children}),useState:value=>[value,()=>{}],useRef:()=>({current:null}),useEffect:()=>{}};
 const opened=[];const tree=createAccountList({React})({lang:'en',rows,loaded:true,busy:false,profile:{id:'u'},route:'customer-list',can:()=>false,onDetail:row=>opened.push(row.id)});
 function find(node){if(!node||typeof node!=='object')return; if(node.props?.className==='crm-account-name')return node;for(const child of (node.children||[]).flat(Infinity)){const found=find(child);if(found)return found;}}
 const name=find(tree);assert.ok(name);
 name.props.onClick({detail:1,nativeEvent:{pointerType:'mouse'}});assert.deepEqual(opened,[]);
 name.props.onClick({detail:2,nativeEvent:{pointerType:'mouse'}});assert.deepEqual(opened,[]);
 name.props.onDoubleClick();assert.deepEqual(opened,['a']);
 name.props.onClick({detail:0,nativeEvent:{}});assert.deepEqual(opened,['a','a']);
 name.props.onClick({detail:1,nativeEvent:{pointerType:'touch'}});assert.deepEqual(opened,['a','a','a']);
});
