import test from 'node:test';
import assert from 'node:assert/strict';
import {quotationGPCondition} from '../src/quotation-gp-condition.mjs';
const people=['manager','director','finance'].map(id=>({id}));
test('GP condition is opt-in and does not change the base route',()=>{
 const base=['manager'];const extra=['director','finance'];
 assert.deepEqual(quotationGPCondition(false,'bad',[],base,people),{low_gp_threshold:null,low_gp_approver_ids:[]});
 assert.deepEqual(quotationGPCondition(true,'20.25',extra,base,people),{low_gp_threshold:20.25,low_gp_approver_ids:extra});
 assert.deepEqual(base,['manager']);assert.deepEqual(extra,['director','finance']);
});
test('GP conditions reject unusable thresholds and unsafe reviewer sequences',()=>{
 for(const value of ['',-1,101,'x',NaN,Infinity,10.123])assert.throws(()=>quotationGPCondition(true,value,['director'],['manager'],people));
 for(const ids of [[],[''],['missing'],['manager'],['director','director']])assert.throws(()=>quotationGPCondition(true,20,ids,['manager'],people));
 assert.throws(()=>quotationGPCondition(true,20,['director'],Array(8).fill('manager'),people));
 for(const n of [0,100,0.01,19.99])assert.equal(quotationGPCondition(true,n,['director'],['manager'],people).low_gp_threshold,n);
});
