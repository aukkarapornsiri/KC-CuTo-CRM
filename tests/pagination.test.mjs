import test from 'node:test';
import assert from 'node:assert/strict';
import {paginationModel,createPagination} from '../src/pagination.mjs';
test('empty, exact boundary, single and unknown totals',()=>{
 assert.equal(paginationModel(0,0).pages,0);
 assert.equal(paginationModel(0,50).pages,1);
 assert.equal(paginationModel(0,51).pages,2);
 assert.equal(paginationModel(0,null).known,false);
 assert.equal(paginationModel(9,51).current,1);
});
test('large lists show first, last and neighbours with a bounded page window',()=>{
 for(let page=0;page<100;page++){
  const m=paginationModel(page,5000),numbers=m.numbers.filter(Number.isInteger);
  assert(numbers.includes(0));assert(numbers.includes(99));assert(numbers.includes(page));
  assert(numbers.length<=7);assert.equal(new Set(numbers).size,numbers.length);
 }
});
const React={createElement:(type,props,...children)=>({type,props:props||{},children:children.flat(Infinity)}),useEffect:()=>{}};
function nodes(n){return n&&typeof n==='object'?[n,...n.children.flatMap(nodes)]:[];}
test('number clicks jump directly; previous and next respect boundaries, busy and empty',()=>{
 const Pagination=createPagination(React),calls=[];
 let tree=Pagination({page:0,total:600,onChange:n=>calls.push(n),lang:'en'});
 let buttons=nodes(tree).filter(n=>n.type==='button');
 assert.equal(buttons[0].props.disabled,true);
 assert.equal(buttons.at(-1).props.disabled,false);
 buttons.find(n=>n.props['aria-label']==='Go to page 12').props.onClick();
 assert.deepEqual(calls,[11]);
 tree=Pagination({page:11,total:600,onChange:n=>calls.push(n),busy:true});
 buttons=nodes(tree).filter(n=>n.type==='button');assert(buttons.every(n=>n.props.disabled));
 buttons[0].props.onClick();assert.deepEqual(calls,[11]);
 tree=Pagination({page:0,total:0,onChange:n=>calls.push(n)});
 assert(nodes(tree).filter(n=>n.type==='button').every(n=>n.props.disabled));
 assert(nodes(tree).find(n=>n.props.role==='status').children[0].includes('0 จาก 0'));
});
