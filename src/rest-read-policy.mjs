// Per-tab REST admission control. Writes and POST RPCs never enter the read queue.
export function createRestReadPolicy(nativeFetch, {origin, now = Date.now, random = Math.random, window: win = globalThis.window} = {}) {
  const cache = new Map(), flights = new Map(), queue = [];
  let active = 0, revision = 0, accessRevision = 0, blockedUntil = 0, failures = 0, probe = false, blockedStatus = 522;
  const invalidate = () => { revision++; cache.clear(); flights.clear(); };
  const invalidateAccess = () => {accessRevision++;for(const flight of flights.values())flight.controller.abort();invalidate();};
  win?.addEventListener('crm-access-changed', invalidateAccess);
  win?.addEventListener('crm-records-refresh', invalidate);
  win?.addEventListener('storage', invalidateAccess);
  const unavailable = () => new Response(JSON.stringify({code:'CRM_READ_BACKOFF', message:'ระบบเชื่อมต่อขัดข้อง กรุณาลองใหม่ภายหลัง'}), {status:blockedStatus,headers:{'Content-Type':'application/json','Retry-After':String(Math.max(1,Math.ceil((blockedUntil-now())/1000)))}});
  function pump() {
    while (active < 5 && queue.length) {
      const job = queue.shift(); active++;
      Promise.resolve().then(job.run).then(job.resolve,job.reject).finally(() => {active--;pump();});
    }
  }
  const enqueue = run => new Promise((resolve,reject) => {queue.push({run,resolve,reject});pump();});
  function waitFor(flight, signal) {
    flight.subscribers++;
    return new Promise((resolve,reject) => {
      let finished=false;
      const finish=()=>{if(finished)return false;finished=true;signal?.removeEventListener('abort',abort);flight.subscribers--;if(!flight.subscribers&&!flight.settled){flight.controller.abort();if(flights.get(flight.key)===flight)flights.delete(flight.key);}return true;};
      const abort=()=>{if(finish())reject(signal?.reason||new DOMException('Aborted','AbortError'));};
      if(signal?.aborted){abort();return;}
      signal?.addEventListener('abort',abort,{once:true});
      flight.promise.then(r=>{if(finish())resolve(r.clone());},e=>{if(finish())reject(e);});
    });
  }
  async function fetchWithPolicy(input, init) {
    const request = new Request(input, init), url = new URL(request.url);
    if (url.origin !== origin || !url.pathname.startsWith('/rest/v1/')) return nativeFetch(input,init);
    if (!['GET','HEAD'].includes(request.method)) {
      invalidate();
      let succeeded=false;
      try {const response=await nativeFetch(input,init);succeeded=response.ok;return response;} finally {invalidate();if(succeeded&&/^\/rest\/v1\/(leads|activities|opportunities|quotations|contracts|tickets|notifications|rpc\/crm_(approval_transition|quotation_transition|so_approval_action|convert_lead|create_sales_order(?:_with_details)?|transition_sales_order))(?:$|\/)/.test(url.pathname))win?.dispatchEvent?.(new Event('crm-work-changed'));}
    }
    if(request.signal.aborted) throw request.signal.reason || new DOMException('Aborted','AbortError');
    const key = JSON.stringify([revision,request.method,request.url,[...request.headers]]);
    const hit = cache.get(key);
    if(hit && hit.expires > now()) return hit.response.clone();
    if(hit) cache.delete(key);
    if(flights.has(key)) return waitFor(flights.get(key),request.signal);
    if(now() < blockedUntil || (failures && probe)) return unavailable();
    const generation = revision, authority=accessRevision, flight={key,controller:new AbortController(),subscribers:0,settled:false,promise:null};
    const promise = enqueue(async () => {
      if(flight.controller.signal.aborted)throw new DOMException('Read cancelled','AbortError');
      if(generation !== revision) throw new DOMException('Read invalidated','AbortError');
      if(now() < blockedUntil || (failures && probe)) return unavailable();
      const wasProbe = failures > 0;
      if(wasProbe) probe = true;
      try {
        // Independent signal: cancelling one subscriber must not cancel other subscribers.
        const response = await nativeFetch(new Request(request,{signal:flight.controller.signal}));
        if(authority!==accessRevision||flight.controller.signal.aborted)throw new DOMException('Read invalidated','AbortError');
        if([429,502,503,504,522].includes(response.status)) {
          failures++;blockedStatus=response.status;
          const retry=response.headers.get('Retry-After'),seconds=retry!==null&&/^\d+(?:\.\d+)?$/.test(retry.trim())?Number(retry)*1000:Date.parse(retry||'')-now();
          const delay=Math.min(120000,5000*2**Math.min(failures-1,5))+Math.floor(random()*1000);
          blockedUntil=now()+Math.max(delay,Number.isFinite(seconds)?Math.max(0,seconds):0);
          cache.clear();return response.status===522?unavailable():response;
        }
        if(wasProbe && response.ok) {failures=0;blockedUntil=0;}
        if(response.ok && generation === revision) {
          const resource = url.pathname.slice('/rest/v1/'.length);
          // Shared templates are read on dialog open, not polled. Keep cross-user edits fresh.
          const ttl = resource === 'crm_quotation_templates' ? 0 : resource === 'master_data_items' ? 300000 : 60000;
          // Bound memory even when filters/search terms vary continually.
          if(cache.size >= 200) cache.delete(cache.keys().next().value);
          cache.set(key,{response:response.clone(),expires:now()+ttl});
        }
        return response;
      } finally {if(wasProbe) probe=false;}
    });
    flight.promise=promise;flights.set(key,flight);
    promise.finally(()=>{flight.settled=true;if(flights.get(key)===flight)flights.delete(key);}).catch(()=>{});
    return waitFor(flight,request.signal);
  }
  return {fetch:fetchWithPolicy,invalidate};
}
