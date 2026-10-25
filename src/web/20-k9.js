/* ───────── the phone version's stand-in for the desktop shell (window.k9) ───────── */
const APPS_SCRIPT_URL = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/;
// calls that can take a while (saves, uploads, document downloads) get a longer timeout
const LONG_ACTIONS = ['save', 'batch', 'settings_set', 'photo_upload', 'digest_test', 'doc_upload', 'doc_remove', 'doc_get'];
const PREFS_KEY = 'k9.prefs';
const DOC_EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Shown only in its own tab or home screen window, never inside another site's page.
const framed = (() => { try { return window.top !== window.self; } catch (e) { return true; } })();
if (framed) { document.body.textContent = 'Open K-9 Salon in its own browser tab.'; throw new Error('K-9 Salon can’t run inside another page.'); }

// The app never takes a key from its address. If one is ever put there, it's taken out of the address bar straight away.
if (/(^#|[&?])k=/.test(location.hash + location.search)) {
  try { history.replaceState(null, '', location.pathname); } catch (e) { location.hash = ''; }
}

function readPrefs() {
  try { const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; }
}
function cleanPrefs(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  if ('url' in p) out.url = String(p.url || '').trim();
  if ('key' in p) out.key = String(p.key || '').trim().slice(0, 200);
  if ('who' in p) out.who = String(p.who || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 60);
  if ('textSize' in p) { const n = Number(p.textSize); out.textSize = n >= 0.8 && n <= 1.6 ? n : 1; }
  if ('contrast' in p) out.contrast = p.contrast === 'high' ? 'high' : 'normal';
  if ('theme' in p) out.theme = ['light', 'dark'].includes(p.theme) ? p.theme : 'system';
  if ('notify' in p) out.notify = !!p.notify;
  if ('autoUpdate' in p) out.autoUpdate = !!p.autoUpdate;
  if ('sheetId' in p) out.sheetId = /^[\w-]{20,100}$/.test(String(p.sheetId || '')) ? String(p.sheetId) : '';
  return out;
}
async function postToBridge(url, key, payload) {
  if (!url || !key) return { ok: false, error: 'not_setup' };
  if (!APPS_SCRIPT_URL.test(url)) return { ok: false, error: 'bad_url' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LONG_ACTIONS.includes(payload && payload.action) ? 360000 : 120000);
  try {
    // plain text and no cookies: a "simple" request, which Google's web app answers from any site
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({}, payload, { key })), redirect: 'follow', credentials: 'omit', cache: 'no-store', signal: ctl.signal });
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { return { ok: false, error: 'bad_reply', status: res.status }; }
  } catch (err) {
    return { ok: false, error: ctl.signal.aborted ? 'timeout' : 'network', message: String((err && err.message) || err), offline: navigator.onLine === false };
  } finally { clearTimeout(timer); }
}
const callBridge = payload => { const p = readPrefs(); return postToBridge(p.url, p.key, payload || {}); };
function toBase64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
const safeName = s => String(s || '').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/^[.\s]+/, '').trim().slice(0, 120);

/* the home screen: install prompts, and the standalone window */
const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
let installEvent = null;
const deviceWatchers = [];
const deviceChanged = () => deviceWatchers.forEach(cb => { try { cb(); } catch (e) { /* ignore */ } });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; deviceChanged(); });
window.addEventListener('appinstalled', () => { installEvent = null; deviceChanged(); });

/* updates: the service worker keeps the app for offline starts and says when a newer version has arrived */
const updateWatchers = [];
let updateState = { state: 'web', version: APP_VERSION };
let swReg = null;
if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
  navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data || {};
    if (d.k9 === 'version' && d.version && d.version !== APP_VERSION) {
      updateState = { state: 'ready', version: String(d.version).slice(0, 20) };
      updateWatchers.forEach(cb => cb(Object.assign({}, updateState)));
    }
  });
  navigator.serviceWorker.register('sw.js', { scope: './' }).then(r => { swReg = r; }).catch(() => {});
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && swReg && Date.now() - lastCheck > 3600000) { lastCheck = Date.now(); swReg.update().catch(() => {}); }
  });
}

window.k9 = {
  isDesktop: false,
  isWeb: true,
  getPrefs: async () => { const p = readPrefs(); const out = {}; ['url', 'key', 'who', 'textSize', 'contrast', 'theme', 'sheetId'].forEach(k => { if (k in p) out[k] = p[k]; }); return out; },
  setPrefs: async patch => {
    const clean = cleanPrefs(patch);
    if (clean.url && !APPS_SCRIPT_URL.test(clean.url)) return { ok: false, error: 'bad_url' };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(Object.assign(readPrefs(), clean))); } catch (e) { return { ok: false, error: 'storage' }; }
    return { ok: true };
  },
  call: payload => callBridge(payload),
  test: input => postToBridge(String((input && input.url) || '').trim(), String((input && input.key) || '').trim(), { action: 'ping' }),
  copy: async text => {
    try { await navigator.clipboard.writeText(String(text)); return true; } catch (e) {
      const t = document.createElement('textarea');
      t.value = String(text); t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(t); t.select();
      const ok = document.execCommand && document.execCommand('copy');
      t.remove();
      if (!ok) throw e;
      return true;
    }
  },
  bridgeScript: async () => { const r = await fetch(`K9AppBridge.gs?v=${APP_VERSION}`); if (!r.ok) throw new Error('The bridge script couldn’t be loaded.'); return r.text(); },
  version: async () => APP_VERSION,
  zoom: async factor => { const f = Math.min(1.6, Math.max(0.8, Number(factor) || 1)); document.documentElement.style.zoom = f === 1 ? '' : String(f); return f; },
  focus: async () => { try { window.focus(); } catch (e) { /* ignore */ } },
  photo: async id => {
    id = String(id || '');
    if (!/^[\w-]{6,120}$/.test(id)) return { ok: false };
    const res = await callBridge({ action: 'photo_get', id });
    if (!res || !res.ok || !res.data || !/^[A-Za-z0-9+/=]+$/.test(res.data)) return { ok: false };
    const mime = /^image\/(jpeg|png|webp)$/.test(res.mime) ? res.mime : 'image/jpeg';
    return { ok: true, url: `data:${mime};base64,${res.data}` };
  },
  // PDFs are made here on the phone and handed back as a file to share or save
  pdf: async input => {
    const name = (safeName(input && input.filename) || 'K-9 Salon.pdf').replace(/(\.pdf)?$/i, '.pdf');
    try {
      const bytes = await htmlToPdf(String((input && input.html) || ''));
      return { ok: true, name, blob: new Blob([bytes], { type: 'application/pdf' }) };
    } catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
  },
  imagesPdf: async images => {
    const list = Array.isArray(images) ? images.slice(0, 30) : [];
    const ok = list.length && list.every(u => typeof u === 'string' && u.length < 20e6 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u));
    if (!ok) return { ok: false, message: 'Only JPEG, PNG or WebP pictures can be combined.' };
    try { return { ok: true, data: toBase64(await imagesToPdf(list)) }; } catch (e) { return { ok: false, message: String((e && e.message) || e) }; }
  },
  // documents are fetched when opened and not kept on the phone
  docOpen: async input => {
    const id = String((input && input.id) || '');
    if (!/^[\w-]{6,120}$/.test(id)) return { ok: false };
    const res = await callBridge({ action: 'doc_get', id });
    if (!res || !res.ok || !res.data || !DOC_EXT[res.mime]) return { ok: false, error: res && res.error, message: (res && res.message) || '' };
    let bytes;
    try { const s = atob(res.data); bytes = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i); } catch (e) { return { ok: false, error: 'bad_reply' }; }
    const name = (safeName(res.name || (input && input.name)) || 'Document').replace(/\.[a-z0-9]{2,4}$/i, '') + '.' + DOC_EXT[res.mime];
    return { ok: true, name, mime: res.mime, blob: new Blob([bytes], { type: res.mime }) };
  },
  docForget: async () => true,
  docPrune: async () => 0,
  getUpdateState: async () => Object.assign({}, updateState),
  updateCheck: async () => { if (swReg) await swReg.update().catch(() => {}); return true; },
  updateInstall: async () => { location.reload(); return { ok: true }; },
  onUpdate: cb => { updateWatchers.push(cb); },
  onSerialPorts: () => {},
  serialChoose: async () => {},
  /* phone only */
  device: () => ({ ios, standalone: standalone(), canInstall: !!installEvent, touch: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) }),
  onDevice: cb => { deviceWatchers.push(cb); },
  install: async () => {
    const e = installEvent;
    if (!e) return false;
    installEvent = null;
    e.prompt();
    const choice = await e.userChoice.catch(() => ({}));
    deviceChanged();
    return choice.outcome === 'accepted';
  },
  qrReader: () => new Promise((resolve, reject) => {
    if (window.jsQR) { resolve(window.jsQR); return; }
    const s = document.createElement('script');
    s.src = `vendor/jsQR.js?v=${APP_VERSION}`;
    s.onload = () => (window.jsQR ? resolve(window.jsQR) : reject(new Error('The code reader didn’t load.')));
    s.onerror = () => reject(new Error('The code reader couldn’t be loaded. Check the internet connection.'));
    document.head.appendChild(s);
  }),
};
