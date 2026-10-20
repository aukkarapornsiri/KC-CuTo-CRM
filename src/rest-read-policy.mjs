// Per-tab REST admission control. Writes and POST RPCs never enter the read queue.
export function createRestReadPolicy(nativeFetch, {origin, now = Date.now, random = Math.random, window: win = globalThis.window} = {}) {
  const cache = new Map(), flights = new Map(), queue = [];
  let active = 0, revision = 0, blockedUntil = 0, failures = 0, probe = false;
  const invalidate = () => { revision++; cache.clear(); flights.clear(); };
  win?.addEventListener('crm-access-changed', invalidate);
  win?.addEventListener('crm-records-refresh', invalidate);
  win?.addEventListener('storage', invalidate);
  const unavailable = () => new Response(JSON.stringify({code:'CRM_READ_BACKOFF', message:'ระบบเชื่อมต่อขัดข้อง กรุณาลองใหม่ภายหลัง'}), {status:522,headers:{'Content-Type':'application/json','Retry-After':String(Math.max(1,Math.ceil((blockedUntil-now())/1000)))}});
  function pump() {
    while (active < 5 && queue.length) {
      const job = queue.shift(); active++;
      Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(() => {active--;pump();});
    }
  }
  const enqueue = run => new Promise((resolve,reject) => {queue.push({run,resolve,reject});pump();});
  function waitFor(promise, signal) {
    if (!signal) return promise.then(r=>r.clone());
    return new Promise((resolve,reject) => {
      const abort = () => {signal.removeEventListener('abort',abort);reject(signal.reason || new DOMException('Aborted','AbortError'));};
      if(signal.aborted) return abort();
      signal.addEventListener('abort',abort,{once:true});
      promise.then(r=>{signal.removeEventListener('abort',abort);if(!signal.aborted)resolve(r.clone());},e=>{signal.removeEventListener('abort',abort);reject(e);});
    });
  }
  async function fetchWithPolicy(input, init) {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin !== origin || !url.pathname.startsWith('/rest/v1/')) return nativeFetch(input,init);
    if (!['GET','HEAD'].includes(request.method)) {
      invalidate();
      let succeeded=false;
      try {const response=await nativeFetch(input,init);succeeded=response.ok;return response;} finally {invalidate();if(succeeded&&/^\/rest\/v1\/(leads|activities|opportunities|quotations|contracts|tickets|notifications|rpc\/crm_(approval_transition|convert_lead|create_sales_order(?:_with_details)?|transition_sales_order))(?:$|\/)/.test(url.pathname))win?.dispatchEvent?.(new Event('crm-work-changed'));}
    }
    if(request.signal.aborted) throw request.signal.reason || new DOMException('Aborted','AbortError');
    const key = JSON.stringify([revision,request.method,request.url,[...request.headers]]);
    const hit = cache.get(key);
    if(hit && hit.expires > now()) return hit.response.clone();
    if(hit) cache.delete(key);
    if(flights.has(key)) return waitFor(flights.get(key),request.signal);
    if(now() < blockedUntil || (failures && probe)) return unavailable();
    const generation = revision;
    const promise = enqueue(async () => {
      if(generation !== revision) throw new DOMException('Read invalidated','AbortError');
      if(now() < blockedUntil || (failures && probe)) return unavailable();
      const wasProbe = failures > 0;
      if(wasProbe) probe = true;
      try {
        // Independent signal: cancelling one subscriber must not cancel other subscribers.
        const response = await nativeFetch(new Request(request,{signal:new AbortController().signal}));
        if(response.status === 522) {
          failures++; blockedUntil = now() + Math.min(120000,5000 * 2 ** Math.min(failures-1,5)) + Math.floor(random()*1000);
          cache.clear(); return unavailable();
        }
        if(wasProbe && response.ok) {failures=0;blockedUntil=0;}
        if(response.ok && generation === revision) {
          const resource = url.pathname.slice('/rest/v1/'.length);
          const ttl = resource === 'master_data_items' ? 300000 : 60000;
          // Bound memory even when filters/search terms vary continually.
          if(cache.size >= 200) cache.delete(cache.keys().next().value);
          cache.set(key,{response:response.clone(),expires:now()+ttl});
        }
        return response;
      } finally {if(wasProbe) probe=false;}
    });
    flights.set(key,promise);
    promise.finally(()=>{if(flights.get(key)===promise)flights.delete(key);}).catch(()=>{});
    return waitFor(promise,request.signal);
  }
  return {fetch:fetchWithPolicy,invalidate};
}
