import test from 'node:test';
import assert from 'node:assert/strict';
import {sortRecordsNewest} from '../src/record-order.mjs';
test('creation time orders before pagination; later edits do not promote old records',()=>{
 const rows=Array.from({length:70},(_,i)=>({id:String(i),created_at:new Date(Date.UTC(2026,0,i+1)).toISOString()}));
 rows[0].updated_at='2099-01-01';const before=structuredClone(rows);
 const result=sortRecordsNewest(rows);assert.equal(result[0].id,'69');assert.equal(result.slice(50)[0].id,'19');assert.deepEqual(rows,before);
});
test('equivalent timezones, tied dates and missing dates have stable ordering',()=>{
 const rows=[{id:'a',code:'SQ-9',created_at:'2026-10-26T12:00:00+07:00'},{id:'b',code:'SQ-10',created_at:'2026-10-26T05:00:00Z'},{id:'z',created_at:'invalid'},{id:'c',created_at:'2026-10-27'}];
 assert.deepEqual(sortRecordsNewest(rows).map(r=>r.id),['c','b','a','z']);assert.deepEqual(sortRecordsNewest(rows.reverse()).map(r=>r.id),['c','b','a','z']);
});
