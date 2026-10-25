/* K-9 Salon phone version: keeps the app's own files so it starts without a connection.
   Records always come from the bridge; nothing from the sheet is stored here. */
const VERSION = '__VERSION__';
const CACHE = 'k9-salon-' + VERSION;
const FILES = __FILES__;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('k9-salon-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    // pages opened with an older version can offer to reload
    for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ k9: 'version', version: VERSION });
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // the bridge and Google Drive go straight to the network
  if (req.mode === 'navigate') {
    // the newest page when online; the kept copy when offline or very slow
    e.respondWith((async () => {
      const net = fetch(url.origin + url.pathname, { cache: 'no-cache', credentials: 'same-origin' }).then(async res => {
        if (res.ok) { const c = await caches.open(CACHE); await c.put('./', res.clone()); }
        return res;
      });
      const kept = await caches.match('./');
      if (!kept) return net;
      const slow = new Promise(r => setTimeout(() => r(kept), 6000));
      return Promise.race([net.catch(() => kept), slow]);
    })());
    return;
  }
  // the app's files carry their version in the address, so a kept copy is always the right one
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') { const c = await caches.open(CACHE); await c.put(req, res.clone()); }
    return res;
  })());
});
