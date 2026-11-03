import {test} from 'node:test';import assert from 'node:assert/strict';import {validFlow} from '../src/approval-flow-settings.mjs';
test('A flow requires distinct eligible users in every step',()=>{const p=[{id:'a'},{id:'b'}];assert.ok(validFlow(['b','a'],p));for(const ids of [[],['a','a'],[''],['a','inactive']])assert.equal(validFlow(ids,p),false)});
