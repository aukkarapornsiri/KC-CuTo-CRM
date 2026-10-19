/**
 * Per-tab backpressure for Supabase Data API.
 * Identical GETs share one flight; independent reads are queued (not writes/auth).
 * The small memory-only cache is keyed by URL, auth and request headers.
 */
export function createSupabaseReadGate(fetchImpl, {
  host,
  maxConcurrent = 5,
  maxQueued = 80,
  cacheMs = 1_500,
  maxCacheEntries = 80,
  cooldownMs = 30_000,
  failuresToOpen = 3,
  now = Date.now,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  if (!host || !Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new TypeError('A Supabase host and a positive maxConcurrent are required');
  }

  const queue = [];
  const inFlight = new Map();
  const cache = new Map();
  let active = 0;
  let failures = 0;
  let blockedUntil = 0;
  let coalesced = 0;
  let cached = 0;
  let revision = 0;

  const abortError = () => new DOMException('Request cancelled before dispatch', 'AbortError');
  const errorResponse = (status, seconds) => new Response(
    JSON.stringify({code: 'KC_READ_BACKPRESSURE', message: 'Data is temporarily unavailable. Please try again.'}),
    {status, headers: {'Content-Type': 'application/json', 'Retry-After': String(seconds)}},
  );
  const isBlocked = () => now() < blockedUntil;

  function recordResult(response) {
    if (response?.ok) { failures = 0; return; }
    if (response?.status >= 500) {
      if (++failures >= failuresToOpen) {
        blockedUntil = now() + cooldownMs;
        failures = 0;
      }
    }
  }
  function recordFailure(error) {
    if (error?.name === 'AbortError') return;
    if (++failures >= failuresToOpen) {
      blockedUntil = now() + cooldownMs;
      failures = 0;
    }
  }
  function pump() {
    while (active < maxConcurrent && queue.length) {
      const job = queue.shift();
      job.detach?.();
      if (job.signal?.aborted) { job.reject(abortError()); continue; }
      active++;
      Promise.resolve().then(() => {
        if (isBlocked()) return errorResponse(503, Math.ceil((blockedUntil - now()) / 1_000));
        return fetchImpl(job.input, job.init);
      }).then(response => {
        // A local circuit-breaker response isn't another upstream failure.
        if (response.status !== 503 || !isBlocked()) recordResult(response);
        if (response.ok && cacheMs > 0 && !job.signal?.aborted && job.revision === revision) {
          cache.delete(job.key);
          cache.set(job.key, {response: response.clone(), expires: now() + cacheMs});
          while (cache.size > maxCacheEntries) cache.delete(cache.keys().next().value);
        }
        job.resolve(response);
      }).catch(error => {
        recordFailure(error);
        job.reject(error);
      }).finally(() => { active--; pump(); });
    }
  }

  function schedule(input, init, key, signal) {
    if (isBlocked()) return Promise.resolve(errorResponse(503, Math.ceil((blockedUntil - now()) / 1_000)));
    if (queue.length >= maxQueued) return Promise.resolve(errorResponse(429, 10));
    return new Promise((resolve, reject) => {
      const job = {input, init, key, signal, revision, resolve, reject, detach: null};
      if (signal) {
        if (signal.aborted) return reject(abortError());
        const onAbort = () => {
          const index = queue.indexOf(job);
          if (index >= 0) { queue.splice(index, 1); reject(abortError()); }
        };
        signal.addEventListener('abort', onAbort, {once: true});
        job.detach = () => signal.removeEventListener('abort', onAbort);
      }
      queue.push(job);
      pump();
    });
  }

  function gate(input, init) {
    let request;
    try { request = new Request(input, init); }
    catch { return fetchImpl(input, init); }
    const url = new URL(request.url);
    if (url.host !== host || !url.pathname.startsWith('/rest/v1/')) return fetchImpl(input, init);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      // Updates, deletes, inserts, and RPC POSTs bypass the read queue.
      if (request.method !== 'OPTIONS') { revision++; cache.clear(); inFlight.clear(); }
      return fetchImpl(input, init);
    }

    const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
    if (signal?.aborted) return Promise.reject(abortError());
    const key = JSON.stringify([
      request.method, request.url, [...request.headers.entries()].sort(),
      request.credentials, request.cache, request.redirect,
    ]);
    if (!signal && inFlight.has(key)) {
      coalesced++;
      return inFlight.get(key).then(response => response.clone());
    }
    const existing = cache.get(key);
    if (existing) {
      if (now() < existing.expires && !signal) {
        cached++;
        return Promise.resolve(existing.response.clone());
      }
      cache.delete(key);
    }
    const promise = schedule(input, init, key, signal);
    if (!signal) {
      inFlight.set(key, promise);
      void promise.finally(() => inFlight.delete(key)).catch(() => {});
    }
    return promise.then(response => response.clone());
  }
  gate.metrics = () => ({active, queued: queue.length, inFlight: inFlight.size, cacheEntries: cache.size,
    coalesced, cacheHits: cached, breakerOpen: isBlocked()});
  return gate;
}
