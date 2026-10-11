import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createNotificationStore} from '../src/notification-store.mjs';

function harness({session = {user: {id: 'alice'}}, hidden = false} = {}) {
  let time = 1_000, sequence = 0, authCallback, sessionValue = session;
  let result = {data: [{id: 'n1'}], error: null, status: 200}, pending = null;
  const timers = new Map(), requests = [], doc = new EventTarget(), win = new EventTarget();
  doc.visibilityState = hidden ? 'hidden' : 'visible';
  win.navigator = {onLine: true};
  const client = {
    auth: {
      getSession: async () => ({data: {session: sessionValue}}),
      onAuthStateChange(callback) { authCallback = callback; return {data: {subscription: {unsubscribe() { authCallback = null; }}}}; },
    },
    from(table) {
      const request = {table, filters: []};
      const query = {
        select(columns) { request.columns = columns; return query; },
        eq(...filter) { request.filters.push(filter); return query; },
        order() { return query; }, limit() { return query; },
        abortSignal(signal) { request.signal = signal; return query; },
        then(resolve, reject) { requests.push(request); return (pending || Promise.resolve(result)).then(resolve, reject); },
      };
      return query;
    },
  };
  const store = createNotificationStore(client, {document: doc, window: win, now: () => time,
    setTimeout(fn, ms) { const id = ++sequence; timers.set(id, {fn, at: time + ms}); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  async function advance(ms = 0) {
    await flush();
    const end = time + ms;
    for (;;) {
      const entry = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!entry) break;
      const [id, value] = entry; time = value.at; timers.delete(id); value.fn(); await flush();
    }
    time = end; await flush();
  }
  return {store, requests, timers, advance, flush,
    visibility(hidden) { doc.visibilityState = hidden ? 'hidden' : 'visible'; doc.dispatchEvent(new Event('visibilitychange')); },
    focus() { win.dispatchEvent(new Event('focus')); },
    online(value) { win.navigator.onLine = value; win.dispatchEvent(new Event(value ? 'online' : 'offline')); },
    auth(next) { sessionValue = next; authCallback?.('SIGNED_IN', next); },
    result(value) { result = value; },
    defer() { let resolve; pending = new Promise(r => { resolve = r; }); return value => { pending = null; resolve(value); }; },
  };
}

test('two consumers share one request initially and one poll per minute', async () => {
  const h = harness(), provider = [], header = [];
  const off1 = h.store.subscribe(rows => provider.push(rows.length));
  const off2 = h.store.subscribe(rows => header.push(rows.length));
  await h.advance();
  assert.equal(h.requests.length, 1);
  assert.equal(provider.at(-1), 1); assert.equal(header.at(-1), 1);
  assert.equal(h.requests[0].columns, 'id');
  assert.ok(h.requests[0].filters.some(([key, value]) => key === 'user_id' && value === 'alice'));
  await h.advance(60_000); assert.equal(h.requests.length, 2);
  off1(); await h.advance(60_000); assert.equal(h.requests.length, 3);
  off2(); await h.advance(120_000); assert.equal(h.requests.length, 3); assert.equal(h.timers.size, 0);
});
test('hidden, offline, signed-out and demo sessions perform no reads; foreground resumes once', async () => {
  const h = harness({hidden: true}); h.store.subscribe(() => {});
  await h.advance(300_000); assert.equal(h.requests.length, 0);
  h.visibility(false); h.focus(); h.focus(); await h.advance(); assert.equal(h.requests.length, 1);
  h.visibility(true); await h.advance(600_000); assert.equal(h.requests.length, 1);
  h.visibility(false); await h.advance(); assert.equal(h.requests.length, 2);
  h.online(false); await h.advance(300_000); assert.equal(h.requests.length, 2);
  h.online(true); await h.advance(); assert.equal(h.requests.length, 3);
  h.auth(null); await h.advance(300_000); assert.equal(h.requests.length, 3);
  const anonymous = harness({session: null}); anonymous.store.subscribe(() => {}); await anonymous.advance(300_000); assert.equal(anonymous.requests.length, 0);
  const demo = harness(); demo.store.subscribe(() => {}, {enabled: false}); await demo.advance(300_000); assert.equal(demo.requests.length, 0);
});
test('slow responses never overlap even after several poll intervals or repeated refreshes', async () => {
  const h = harness(), finish = h.defer(); h.store.subscribe(() => {});
  await h.advance(180_000); void h.store.refresh(); void h.store.refresh(); h.focus(); await h.advance();
  assert.equal(h.requests.length, 1);
  finish({data: [], error: null}); await h.flush(); await h.advance(60_000);
  assert.equal(h.requests.length, 2);
});
test('sign-out clears badges and late responses cannot leak between accounts', async () => {
  const h = harness(), values = [], finish = h.defer(); h.store.subscribe(rows => values.push(rows)); await h.advance();
  h.auth(null); assert.equal(h.requests[0].signal.aborted, true); assert.deepEqual(values.at(-1), []);
  finish({data: [{id: 'private-alice'}], error: null}); await h.flush(); assert.deepEqual(values.at(-1), []);
  h.result({data: [{id: 'private-bob'}], error: null}); h.auth({user: {id: 'bob'}}); await h.advance();
  assert.deepEqual(values.at(-1), [{id: 'private-bob'}]);
  assert.ok(h.requests.at(-1).filters.some(([key, value]) => key === 'user_id' && value === 'bob'));
});
test('errors retain the last badge and 402 backs off despite focus and manual refresh', async () => {
  const h = harness(), values = []; h.store.subscribe(rows => values.push(rows.length)); await h.advance();
  h.result({data: null, error: {message: 'Payment required'}, status: 402}); await h.advance(60_000);
  assert.equal(h.requests.length, 2); assert.equal(values.at(-1), 1);
  h.focus(); await h.store.getUnread(); await h.advance(299_999); assert.equal(h.requests.length, 2);
  await h.advance(1); assert.equal(h.requests.length, 3);
});
test('manual refresh updates both consumers without waiting for the next poll', async () => {
  const h = harness(), a = [], b = []; h.store.subscribe(rows => a.push(rows.length)); h.store.subscribe(rows => b.push(rows.length)); await h.advance();
  h.result({data: [], error: null}); await h.store.getUnread();
  assert.equal(h.requests.length, 2); assert.equal(a.at(-1), 0); assert.equal(b.at(-1), 0);
  h.auth({user: {id: 'alice'}}); h.focus(); await h.advance(); assert.equal(h.requests.length, 2);
});
test('a mutation during an existing request schedules one follow-up without overlap', async () => {
  const h = harness(), values = [], finish = h.defer(); h.store.subscribe(rows => values.push(rows.length)); await h.advance();
  void h.store.getUnread(); void h.store.getUnread(); assert.equal(h.requests.length, 1);
  h.result({data: [], error: null}); finish({data: [{id: 'read-before-mutation'}], error: null});
  await h.advance(); assert.equal(h.requests.length, 2); assert.equal(values.at(-1), 0);
});
test('live bundle mounts both badges on the shared store and removes their old intervals', () => {
  const bundle = fs.readFileSync(new URL('../app-C2ITSffc.js', import.meta.url), 'utf8');
  assert.ok(bundle.includes('b2=createNotificationStore(Se)'));
  assert.equal((bundle.match(/b2\.subscribe\(/g) || []).length, 2);
  assert.ok(!bundle.includes('setInterval(A,6e4)')); assert.ok(!bundle.includes('setInterval(ce,6e4)'));
});
