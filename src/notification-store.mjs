// One authenticated, visibility-aware unread feed per browser tab.
// Both AppProvider and the header subscribe to this same instance.
export function createNotificationStore(client, {
  document: doc = globalThis.document,
  window: win = globalThis.window,
  now = Date.now,
  setTimeout: later = globalThis.setTimeout,
  clearTimeout: cancel = globalThis.clearTimeout,
  interval = 60_000,
} = {}) {
  const listeners = new Set();
  let rows = [], userId = null, timer = null, flight = null, auth = null;
  let generation = 0, lifecycle = 0, authRevision = 0, nextRead = 0, failures = 0;
  const visible = () => doc?.visibilityState !== 'hidden' && win?.navigator?.onLine !== false;
  const ready = () => listeners.size > 0 && userId && visible();
  const emit = () => { for (const listener of listeners) listener(rows); };
  const stopTimer = () => { if (timer !== null) cancel(timer); timer = null; };
  function schedule() {
    stopTimer();
    if (ready() && !flight) timer = later(() => { timer = null; void refresh(); }, Math.max(0, nextRead - now()));
  }
  function setSession(session) {
    const id = session?.user?.id || null;
    if (id !== userId) {
      generation++;
      flight?.controller.abort();
      flight = null;
      userId = id;
      rows = [];
      nextRead = 0;
      failures = 0;
      emit();
    }
    schedule();
  }
  async function refresh({force = false} = {}) {
    if (!ready()) return rows;
    if (flight) {
      if (force) flight.invalidated = true;
      return flight.promise;
    }
    // User actions may invalidate a fresh result, but cannot bypass error backoff.
    if (now() < nextRead && (!force || failures)) return rows;
    stopTimer();
    const request = {generation, controller: new AbortController(), promise: null};
    flight = request;
    request.promise = (async () => {
      try {
        const {data, error, status} = await client.from('notifications')
          .select('id').eq('user_id', userId).eq('is_read', false)
          .order('created_at', {ascending: false}).limit(20)
          .abortSignal(request.controller.signal);
        if (error) throw Object.assign(new Error(error.message), {status});
        if (request.generation !== generation) return [];
        rows = data || [];
        failures = 0;
        nextRead = now() + interval;
        emit();
      } catch (error) {
        if (request.generation !== generation) return [];
        failures++;
        const delay = Math.min(interval * 2 ** Math.min(failures, 4), 15 * 60_000);
        nextRead = now() + Math.max(delay, [401, 402, 403, 429].includes(error.status) ? 5 * 60_000 : 0);
        // Preserve the last known badge on transient errors instead of clearing it.
      } finally {
        if (flight === request) {
          flight = null;
          if (request.invalidated && !failures) nextRead = 0;
          schedule();
        }
      }
      return rows;
    })();
    return request.promise;
  }
  const wake = () => schedule();
  function start() {
    const epoch = ++lifecycle, revision = authRevision;
    auth = client.auth.onAuthStateChange((_event, session) => {
      if (epoch !== lifecycle) return;
      authRevision++;
      // No awaited Supabase call inside the auth callback (avoids auth lock deadlock).
      setSession(session);
    }).data.subscription;
    client.auth.getSession().then(({data}) => {
      if (epoch === lifecycle && revision === authRevision) setSession(data?.session);
    }).catch(() => { if (epoch === lifecycle && revision === authRevision) setSession(null); });
    doc?.addEventListener('visibilitychange', wake);
    win?.addEventListener('focus', wake);
    win?.addEventListener('online', wake);
    win?.addEventListener('offline', wake);
  }
  function stop() {
    lifecycle++;
    generation++;
    stopTimer();
    auth?.unsubscribe();
    auth = null;
    flight?.controller.abort();
    flight = null;
    userId = null;
    rows = [];
    nextRead = failures = 0;
    doc?.removeEventListener('visibilitychange', wake);
    win?.removeEventListener('focus', wake);
    win?.removeEventListener('online', wake);
    win?.removeEventListener('offline', wake);
  }
  function subscribe(listener, {enabled = true} = {}) {
    if (!enabled) { listener([]); return () => {}; }
    listeners.add(listener);
    listener(rows);
    if (listeners.size === 1) start();
    return () => { listeners.delete(listener); if (!listeners.size) stop(); };
  }
  async function markRead(id) {
    if (!userId) return;
    let query = client.from('notifications').update({is_read: true}).eq('user_id', userId);
    query = id ? query.eq('id', id) : query.eq('is_read', false);
    const {error} = await query;
    if (error) throw error;
    return refresh({force: true});
  }
  return {subscribe, refresh, getUnread: () => refresh({force: true}), markRead, markAllRead: () => markRead()};
}
