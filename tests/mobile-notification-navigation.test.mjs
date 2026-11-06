import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMobileHome} from '../src/mobile-home.mjs';
function fixture(mobile=true){
 const effects=[],listeners=new Map(),cleanup=[];let launches=0;const routes=[];
 globalThis.window={matchMedia:()=>({matches:mobile,addEventListener(){},removeEventListener(){}})};
 globalThis.document={querySelector:selector=>selector==='.kc-header-approval'?{dataset:{},click:()=>launches++}:null,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name);}};
 const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'fragment',useState:value=>[typeof value==='function'?value():value,()=>{}],useEffect:fn=>effects.push(fn)};
 const tree=createMobileHome({React,useAccess:()=>({can:()=>false})})({activeModule:'dashboard',modules:[],onNavigate:(...args)=>routes.push(args),renderContent:()=>null});
 effects.forEach(fn=>{const off=fn();if(off)cleanup.push(off);});
 return {tree,listeners,routes,launches:()=>launches,dispose:()=>{cleanup.forEach(fn=>fn());delete globalThis.window;delete globalThis.document;}};
}
test('mobile header bell opens approval inbox once and stops legacy notification navigation',()=>{
 const f=fixture();try{let prevented=false,stopped=false;f.listeners.get('click')({target:{closest:s=>s==='.kc-header-notifications'},preventDefault:()=>prevented=true,stopPropagation:()=>stopped=true});assert.equal(f.launches(),1);assert.ok(prevented&&stopped);assert.deepEqual(f.routes,[]);f.listeners.get('click')({target:{closest:()=>null}});assert.equal(f.launches(),1);}finally{f.dispose();}assert.equal(f.listeners.size,0);
});
test('mobile notification shortcut opens universal inbox without quotation permission',()=>{
 const f=fixture();try{const all=[];function walk(n){if(!n||typeof n!=='object')return;all.push(n);[n.props.children].flat(Infinity).forEach(walk);}walk(f.tree);all.find(n=>n.props['data-action']==='mobile-notifications').props.onClick();assert.equal(f.launches(),1);assert.deepEqual(f.routes,[]);}finally{f.dispose();}
});
test('desktop bell keeps its existing notifications destination',()=>{const f=fixture(false);try{assert.equal(f.listeners.has('click'),false);}finally{f.dispose();}});
