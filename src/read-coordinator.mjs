// Shared, session-scoped reads. Each resource has one request and one freshness clock.
const coordinators = new WeakMap();
export const readIdentity = p => JSON.stringify([p?.id,p?.role,p?.custom_role_key,p?.department_group,p?.is_active,p?.is_super_admin,p?.access_active]);
export function observeRead(client, options, listener) {
  if (!coordinators.has(client)) coordinators.set(client, createReadCoordinator(client));
  return coordinators.get(client).subscribe(options, listener);
}
export function createReadCoordinator(client, {
  document: doc = globalThis.document, window: win = globalThis.window,
  now = Date.now, setTimeout: later = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout,
} = {}) {
  const entries = new Map(), events = new Map();
  let timer = null, auth = null, userId = null, lifecycle = 0, authRevision = 0;
  const visible = () => doc?.visibilityState !== 'hidden' && win?.navigator?.onLine !== false;
  const ready = e => e.listeners.size && visible() && (e.demo || (userId && userId === e.userId));
  const emit = e => { for (const fn of e.listeners) fn(e.state); };
  function stopTimer() { if (timer !== null) cancel(timer); timer = null; }
  function schedule() {
    stopTimer();
    const due = [...entries.values()].filter(e => ready(e) && !e.flight && Number.isFinite(e.next)).map(e => e.next);
    if (due.length) timer = later(() => {
      timer = null;
      for (const e of entries.values()) if (ready(e) && !e.flight && e.next <= now()) void run(e);
      schedule();
    }, Math.max(0, Math.min(...due) - now()));
  }
  function reset(e) {
    e.generation++; e.flight?.controller.abort(); e.flight = null;
    e.next = 0; e.failures = 0; e.state = {data:null,error:null,loading:false}; emit(e);
  }
  function sessionChanged(session) {
    const id = session?.user?.id || null;
    if (id !== userId) { userId = id; for (const e of entries.values()) if (!e.demo) reset(e); }
    schedule();
  }
  function invalidate(e) {
    if (e.flight) e.flight.invalidated = true;
    if (!e.failures) e.next = 0;
  }
  async function run(e, force = false) {
    if (force) invalidate(e);
    if (!ready(e)) { schedule(); return e.state.data; }
    if (e.flight) return e.flight.promise;
    if (now() < e.next) return e.state.data;
    const request = {generation:e.generation,controller:new AbortController(),promise:null};
    e.flight = request; e.state = {...e.state,loading:true}; emit(e);
    request.promise = Promise.resolve().then(() => e.load(request.controller.signal)).then(data => {
      if (request.generation !== e.generation) return null;
      e.failures = 0; e.next = e.demo ? Infinity : now() + e.interval;
      e.state = {data,error:null,loading:false}; emit(e); return data;
    }).catch(error => {
      if (request.generation !== e.generation) return null;
      // A queued read invalidated by a successful write is not an access denial.
      // Keep the gate loading until a fresh read verifies the current permissions.
      if (error?.name === 'AbortError' || /^(?:AbortError: )?Read invalidated$/.test(error?.message || '')) {
        e.failures++;
        e.next = now() + Math.min(250 * 2 ** Math.min(e.failures - 1, 5), 5000);
        e.state = {...e.state,error:null,loading:true}; emit(e); return null;
      }
      e.failures++;
      const denied = [401,403].includes(error.status) || error.code === '42501';
      e.next = now() + Math.max(Math.min(e.interval * 2 ** Math.min(e.failures,4),900_000),[401,402,403,429].includes(error.status)||denied?300_000:0);
      e.state = {data:denied?null:e.state.data,error,loading:false}; emit(e); return null;
    }).finally(() => {
      if (e.flight === request) { e.flight = null; if (request.invalidated && !e.failures) e.next = 0; schedule(); }
    });
    schedule(); return request.promise;
  }
  const wake = () => schedule();
  function start() {
    const epoch = ++lifecycle, revision = authRevision;
    // Schedule reads outside the Supabase auth callback to avoid its session lock.
    auth = client.auth.onAuthStateChange((_event,session) => {
      if (epoch !== lifecycle) return; authRevision++; sessionChanged(session);
    }).data.subscription;
    client.auth.getSession().then(({data}) => {
      if (epoch === lifecycle && revision === authRevision) sessionChanged(data?.session);
    }).catch(() => { if (epoch === lifecycle && revision === authRevision) sessionChanged(null); });
    doc?.addEventListener('visibilitychange',wake);
    for (const event of ['focus','online','offline']) win?.addEventListener(event,wake);
  }
  function stop() {
    lifecycle++; stopTimer(); auth?.unsubscribe(); auth = null; userId = null;
    for (const e of entries.values()) { e.generation++; e.flight?.controller.abort(); }
    entries.clear();
    for (const [event,fn] of events) win?.removeEventListener(event,fn);
    events.clear(); doc?.removeEventListener('visibilitychange',wake);
    for (const event of ['focus','online','offline']) win?.removeEventListener(event,wake);
  }
  function subscribe({key,userId:actor,demo=false,load,interval=60_000,events:changed=[],enabled=true},listener) {
    if (!enabled) return Object.assign(() => {}, {refresh:async()=>null});
    const id = JSON.stringify([demo,actor,key]);
    let e = entries.get(id);
    if (!e) { e = {key,userId:actor,demo,load,interval,listeners:new Set(),events:new Set(),next:0,failures:0,generation:0,flight:null,state:{data:null,error:null,loading:false}}; entries.set(id,e); }
    e.load = load;
    for (const event of ['crm-access-changed',...changed]) {
      e.events.add(event);
      if (!events.has(event)) {
        const fn = () => { for (const item of entries.values()) if (item.events.has(event)) invalidate(item); schedule(); };
        events.set(event,fn); win?.addEventListener(event,fn);
      }
    }
    e.listeners.add(listener); listener(e.state);
    if (!auth) start();
    schedule();
    let subscribed = true;
    const unsubscribe = () => {
      if (!subscribed) return; subscribed = false; e.listeners.delete(listener);
      if (!e.listeners.size && e.flight) { e.generation++; e.flight.controller.abort(); e.flight = null; e.next = 0; e.state = {...e.state,loading:false}; }
      if (![...entries.values()].some(item => item.listeners.size)) stop(); else schedule();
    };
    unsubscribe.refresh = () => subscribed ? run(e,true) : Promise.resolve(null);
    return unsubscribe;
  }
  return {subscribe};
}
