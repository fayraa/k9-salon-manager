/* K-9 Salon phone version: keeps the app's own files so it starts without a connection.
   Records always come from the bridge; nothing from the sheet is stored here.
   Every kept file is checked against the fingerprint it had when this version was built, so a copy changed by
   anything else (another page on the same site, say) is never used. */
const VERSION = '__VERSION__';
const CACHE = 'k9-salon-' + VERSION;
const FILES = __FILES__; // address → SHA-256, kept when the app is installed
const LATER = __LATER__; // address → SHA-256, kept the first time they're used
const KNOWN = Object.assign({}, FILES, LATER);
const scopeURL = new URL('./', self.registration.scope).href;
const keyOf = url => { const u = new URL(url); const path = u.href.slice(scopeURL.length).split('#')[0]; return path === '' || path === 'index.html' ? './' : path; };

async function sha256(res) {
  const d = await crypto.subtle.digest('SHA-256', await res.clone().arrayBuffer());
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}
/** A kept copy, only if it's exactly the file this version was built with. */
async function kept(key) {
  const c = await caches.open(CACHE);
  const res = await c.match(key);
  if (!res) return null;
  if (await sha256(res) === KNOWN[key]) return res;
  await c.delete(key);
  return null;
}
async function keep(key, res) {
  if (!KNOWN[key] || !res.ok || res.type !== 'basic') return;
  if (await sha256(res) !== KNOWN[key]) return; // a newer version is already published: don't mix it in
  const c = await caches.open(CACHE);
  await c.put(key, res.clone());
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    for (const key of Object.keys(FILES)) {
      const res = await fetch(new Request(new URL(key, scopeURL).href, { cache: 'reload', credentials: 'same-origin' }));
      if (!res.ok) throw new Error(`Couldn't keep ${key}`);
      await keep(key, res);
    }
    await self.skipWaiting();
  })());
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
  if (url.origin !== self.location.origin || !url.href.startsWith(scopeURL)) return; // the bridge and Google Drive go straight to the network
  const key = keyOf(url.href);
  if (req.mode === 'navigate') {
    if (key !== './') return; // only the app's own page is kept; anything else on the site is left alone
    // the newest page when online; the kept copy when offline or very slow
    e.respondWith((async () => {
      const net = fetch(scopeURL, { cache: 'no-cache', credentials: 'same-origin' }).then(async res => { await keep('./', res).catch(() => {}); return res; });
      const copy = await kept('./');
      if (!copy) return net;
      const slow = new Promise(r => setTimeout(() => r(copy), 6000));
      return Promise.race([net.catch(() => copy), slow]);
    })());
    return;
  }
  if (!KNOWN[key]) return; // not one of the app's files: straight to the network, never kept
  // the app's files carry their version in the address, so a kept copy is the right one
  e.respondWith((async () => {
    const copy = await kept(key);
    if (copy) return copy;
    const res = await fetch(req);
    await keep(key, res).catch(() => {});
    return res;
  })());
});
