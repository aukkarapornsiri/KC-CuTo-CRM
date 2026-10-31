import test from 'node:test';import assert from 'node:assert/strict';
import {bangkokDay,periodInput,periodAnchor,periodBounds,filterLeadPeriod} from '../src/lead-period.mjs';
test('Bangkok date boundaries include UTC evening in the next calendar day',()=>{
 const rows=[{id:1,created_at:'2026-10-30T16:59:59Z'},{id:2,created_at:'2026-10-30T17:00:00Z'},{id:3,created_at:'2026-10-31T16:59:59Z'},{id:4,created_at:'2026-10-31T17:00:00Z'},{id:5,created_at:null}];
 assert.equal(bangkokDay(rows[1].created_at),'2026-10-31');assert.deepEqual(filterLeadPeriod(rows,'day','2026-10-31').map(r=>r.id),[2,3]);assert.equal(filterLeadPeriod(rows,'all','2026-10-31'),rows);
});
test('calendar periods include leap days and ISO weeks crossing years',()=>{
 assert.deepEqual(periodBounds('month','2024-02-12'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(periodBounds('year','2026-10-31'),{from:'2026-01-01',to:'2026-12-31'});
 assert.deepEqual(periodBounds('week','2026-10-31'),{from:'2026-10-26',to:'2026-11-01'});
 assert.equal(periodInput('week','2021-01-01'),'2020-W53');assert.equal(periodAnchor('week','2020-W53'),'2020-12-28');assert.equal(periodAnchor('week','2021-W53'),'');
 assert.equal(periodAnchor('month','2026-11'),'2026-11-01');assert.equal(periodAnchor('year','2027'),'2027-01-01');
});
