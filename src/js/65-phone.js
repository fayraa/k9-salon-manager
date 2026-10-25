/* ───────── the phone version: connecting a phone, sharing files, the home screen ───────── */
const PHONE_URL = 'https://fayraa.github.io/k9-salon-manager/'; // when the shell doesn't say (package.json k9.phoneUrl)
const BRIDGE_URL_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/;
const CODE_PREFIX = 'K9SALON:1:';
/** The connection code shown on the computer. It's plain text rather than a link, so a phone's camera app doesn't
    open it in the browser (where it would stay in the browser's history): only the app's own scanner reads it. */
function connectCode(url, key) {
  const m = String(url).match(/^https:\/\/script\.google\.com\/macros\/s\/([\w-]+)\/exec$/);
  return `${CODE_PREFIX}${m ? 's=' + m[1] : 'u=' + encodeURIComponent(url)}&k=${encodeURIComponent(key)}`;
}
/** Reads a connection code: K9SALON:1:s=<deployment ID>&k=<key>, or K9SALON:1:u=<web app URL>&k=<key>. */
function parseConnect(text) {
  const s = String(text || '').trim();
  if (!s.startsWith(CODE_PREFIX)) return null;
  let p;
  try { p = new URLSearchParams(s.slice(CODE_PREFIX.length)); } catch (e) { return null; }
  const key = (p.get('k') || '').trim(), dep = (p.get('s') || '').trim();
  const url = (p.get('u') || (/^[\w-]{10,200}$/.test(dep) ? `https://script.google.com/macros/s/${dep}/exec` : '')).trim();
  return /^[\w-]{10,200}$/.test(key) && BRIDGE_URL_RE.test(url) ? { url, key } : null;
}
/** The end of a web app's address, so two connections can be told apart. */
const webAppTail = url => { const m = String(url || '').match(/\/s\/([\w-]+)\/exec$/); return m ? `…${m[1].slice(-6)}` : ''; };
const device = () => (window.k9.device ? window.k9.device() : {});

/* on the computer: the codes a phone scans */
let phoneCodeTimer = null;
function phoneSectionHTML() {
  const ready = !!(S.prefs.url && S.prefs.key && BRIDGE_URL_RE.test(S.prefs.url));
  const base = S.phoneUrl || PHONE_URL;
  const shown = base.replace(/^https:\/\//, '').replace(/\/$/, '');
  let code = `<div class="row"><button class="btn primary" data-action="phone-code">Show the connection code</button></div>`;
  if (!ready) code = `<p class="note">${icon('info')}<span>Connect this computer to your sheet first (Connection, below).</span></p>`;
  else if (S.phoneCode) {
    code = `<div class="phone-code">${qrSVG(connectCode(S.prefs.url, S.prefs.key), 'Connection code for a phone')}
      <div class="grid" style="gap:12px;align-content:start"><p class="form-warn">${icon('info')}<span>Anyone who scans this code with K-9 Salon can open and change your records. Show it only to your own staff, and hide it when you’re done. It hides itself after 3 minutes.</span></p>
      <div class="row"><button class="btn" data-action="phone-code-hide">Hide the code</button></div></div></div>`;
  }
  return `<section class="set" id="set-phone"><h2>Use on a phone</h2>
    <p class="muted">The phone version runs in the phone’s web browser and sits on its home screen like an app. It uses the same sheet as this computer, so everything stays in step.</p>
    <ol class="steps compact">
      <li><div><b>Open the phone version</b><p>Scan this code with the phone’s camera, or go to <a href="${esc(base)}" target="_blank" rel="noopener">${esc(shown)}</a>.</p><div class="phone-link">${qrSVG(base, `Code that opens ${shown}`)}</div></div></li>
      <li><div><b>Add it to the home screen</b><p>iPhone: tap <b>Share</b>, then <b>Add to Home Screen</b>. Android: tap <b>Add</b> when the app offers it, or the ⋮ menu, then <b>Add to Home screen</b>.</p></div></li>
      <li><div><b>Connect it</b><p>Open K-9 Salon from the home screen, tap <b>Scan the code</b> and point it at the connection code below. Type your name there, so the change history shows who saved what.</p></div></li>
    </ol>
    ${code}
    <p class="muted small">The phone version has no records of its own: each phone needs the connection code (or the web app URL and access key) before it shows anything.</p>
  </section>`;
}
function showPhoneCode(on) {
  S.phoneCode = !!on;
  clearTimeout(phoneCodeTimer);
  if (on) phoneCodeTimer = setTimeout(() => showPhoneCode(false), 180000);
  if (S.view !== 'settings') return;
  const main = $('#main'), y = main.scrollTop;
  renderView();
  main.scrollTop = y;
  const b = $(on ? '[data-action="phone-code-hide"]' : '[data-action="phone-code"]');
  if (b && OV.length === 0 && (on || document.activeElement === document.body)) b.focus({ preventScroll: true });
}
/** Takes the connection code off the screen without redrawing (when the view is changing anyway). */
function hidePhoneCode() { S.phoneCode = false; clearTimeout(phoneCodeTimer); }

/* on the phone: connecting */
function phoneSetupView() {
  const d = device();
  return `<div class="setup">
  <div><h2>Connect this phone</h2><p class="lede">The phone uses the same Google Sheet as K-9 Salon Manager on the computer. You only connect it once.</p></div>
  ${d.ios && !d.standalone ? `<p class="note">${icon('info')}<span>On an iPhone, add K-9 Salon to the home screen first: tap <b>Share</b>, then <b>Add to Home Screen</b>. Then open it from there and connect it. iPhone keeps home screen apps separate from Safari.</span></p>` : ''}
  <ol class="steps">
    <li><div><b>Show the connection code on the computer</b><p>In K-9 Salon Manager on the computer, open <b>Settings</b>, go to <b>Use on a phone</b> and choose <b>Show the connection code</b>.</p></div></li>
    <li><div><b>Scan it here</b><p>Tap the button and point the camera at the code.</p><div class="row"><button class="btn primary" data-action="scan-connect">${icon('camera')}Scan the code</button></div></div></li>
  </ol>
  <details class="manual"><summary>Enter the web app URL and access key instead</summary><div class="manual-b">${connFields(S.prefs, 'setup-form', true)}</div></details>
  <p class="muted small">The connection is kept only on this phone. Anyone with both the URL and the key could read and change your records, so keep the phone locked.</p>
  </div>`;
}
let pendingConnect = null;
async function handleConnectCode(raw) {
  const c = parseConnect(raw);
  if (!c) { toast('That isn’t a K-9 Salon connection code.', true); return; }
  if (c.url === S.prefs.url && c.key === S.prefs.key) { toast('This phone is already connected.'); return; }
  toast('Checking the connection…');
  const res = await window.k9.test(c).catch(() => ({ ok: false, error: 'network' }));
  if (!res || !res.ok) { toast(deskText(res || {}), true); return; }
  const switching = !!(S.prefs.url && S.prefs.key);
  pendingConnect = { c, title: String(res.title || 'your sheet').slice(0, 200), version: Number(res.version) || 0 };
  const now = switching ? `<p class="form-warn">${icon('info')}<span>This phone now uses <b>${esc(S.sheetTitle || 'another sheet')}</b> (web app ${esc(webAppTail(S.prefs.url))}). Switch only if this code came from your own computer.</span></p>` : '';
  const o = modal('connect', {
    title: switching ? 'Switch this phone to another sheet?' : 'Connect this phone?', narrow: true, form: true,
    body: `<p style="margin:0">This connects the phone to <b>${esc(pendingConnect.title)}</b> (web app ${esc(webAppTail(c.url))}).</p>${now}
      <div class="field"><label for="cn-who">Your name</label><input class="inp" id="cn-who" value="${esc(S.prefs.who || '')}" autocomplete="name" placeholder="For example Austin" maxlength="60"><span class="hint">Shown in the change history for what you save on this phone.</span></div>`,
    foot: `<span class="msg" id="cn-msg" aria-live="polite"></span><button type="button" class="btn" data-action="close-top">Cancel</button><button type="submit" class="btn primary">${switching ? 'Switch' : 'Connect'}</button>`,
  });
  o.onClose = () => { pendingConnect = null; };
  $('form', o.el).addEventListener('submit', e => { e.preventDefault(); confirmConnect(o); });
}
async function confirmConnect(o) {
  const p = pendingConnect;
  if (!p) return;
  const who = ($('#cn-who', o.el).value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 60);
  const saved = await window.k9.setPrefs({ url: p.c.url, key: p.c.key, who }).catch(() => ({ ok: false }));
  if (!saved || !saved.ok) {
    const m = $('#cn-msg', o.el);
    m.textContent = saved && saved.error === 'storage' ? 'This browser won’t let the app keep its settings. Turn off private browsing and try again.' : deskText(saved || {});
    m.className = 'msg err';
    return;
  }
  S.prefs = Object.assign({}, S.prefs, { url: p.c.url, key: p.c.key, who });
  closeTop(true);
  toast(`Connected to “${p.title}”${p.version && p.version < BRIDGE_LATEST ? '. The bridge script has an update available.' : ''}`);
  S.db = null;
  if (S.view === 'settings') S.view = 'home';
  connect();
}
/** Reads the connection code with the phone's camera, inside the app. */
async function scanConnect() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('This browser can’t use the camera here. Enter the web app URL and access key instead.', true); return; }
  const o = modal('scan', {
    title: 'Scan the code', narrow: true,
    body: `<div class="scan-view"><video id="scan-video" playsinline muted aria-hidden="true"></video><span class="scan-frame" aria-hidden="true"></span></div><p class="muted" id="scan-msg" role="status" style="margin:0">Starting the camera…</p>`,
    foot: `<span class="msg"></span><button type="button" class="btn" data-action="close-top">Cancel</button>`,
  });
  let stream = null, stopped = false, timer = null;
  const stop = () => { stopped = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); };
  o.onClose = stop;
  const say = t => { const m = $('#scan-msg', o.el); if (m) m.textContent = t; };
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) {
    say(e && e.name === 'NotAllowedError' ? 'The camera isn’t allowed for K-9 Salon. Allow it in the phone’s settings, or close this and enter the URL and key instead.' : 'The camera couldn’t start. Close this and enter the URL and key instead.');
    return;
  }
  if (stopped) { stop(); return; }
  const video = $('#scan-video', o.el);
  video.srcObject = stream;
  await video.play().catch(() => {});
  let detector = null, reader = null;
  try { if ('BarcodeDetector' in window && (await window.BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
  if (!detector) { try { reader = await window.k9.qrReader(); } catch (e) { stop(); say(e.message); return; } }
  if (stopped) return;
  say('Point the camera at the code on the computer screen.');
  const canvas = document.createElement('canvas'), g = canvas.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (stopped) return;
    let text = '';
    try {
      if (video.readyState >= 2 && video.videoWidth) {
        if (detector) { const codes = await detector.detect(video); text = (codes[0] && codes[0].rawValue) || ''; }
        else {
          const sc = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * sc); canvas.height = Math.round(video.videoHeight * sc);
          g.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = g.getImageData(0, 0, canvas.width, canvas.height);
          const r = reader(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
          text = (r && r.data) || '';
        }
      }
    } catch (e) { /* try the next picture */ }
    if (stopped) return;
    if (text && parseConnect(text)) { stop(); closeTop(true); handleConnectCode(text); return; }
    if (text) say('That isn’t the connection code. On the computer, open Settings, go to Use on a phone and choose Show the connection code.');
    timer = setTimeout(tick, 200);
  };
  tick();
}

/* files made or opened on the phone: share them, save them, or look at them */
function offerFile(blob, name, title) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  let share = false;
  try { share = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { share = false; }
  // a file downloaded inside an iPhone home screen app can leave you with no way back, so iPhones share instead
  const save = !share || !device().ios;
  const url = URL.createObjectURL(blob);
  const pic = /^image\//.test(blob.type);
  const o = modal('file', {
    title: title || name, narrow: !pic, wide: pic,
    body: `${pic ? `<img class="viewer-img" src="${url}" alt="${esc(title || name)}">` : `<div class="dc-pick">${icon('pdf')}<span><b>${esc(name)}</b><small>${fileSize(blob.size)}</small></span></div>`}
      <p class="muted" style="margin:0">${share ? 'Share sends it to email, WhatsApp, Files or the printer.' : 'Save keeps a copy on this device.'}</p>`,
    foot: `<span class="msg" id="file-msg" aria-live="polite"></span><button type="button" class="btn" data-action="close-top">Close</button>${save ? `<a class="btn${share ? '' : ' primary'}" href="${url}" download="${esc(name)}">Save</a>` : ''}${share ? '<button type="button" class="btn primary" data-action="file-share">Share</button>' : ''}`,
  });
  o.file = file;
  o.onClose = () => setTimeout(() => URL.revokeObjectURL(url), 60000);
  return o;
}
async function shareFile() {
  const o = topOverlay('file');
  if (!o || !o.file) return;
  try { await navigator.share({ files: [o.file], title: o.file.name }); }
  catch (e) {
    if (e && e.name === 'AbortError') return;
    const m = $('#file-msg', o.el);
    if (m) { m.textContent = 'Couldn’t share it. Try again in a moment.'; m.className = 'msg err'; }
  }
}

/* the home screen */
function installBannerHTML() {
  if (!WEB || !S.db || S.installLater || store.get('k9.installHint') === 'off') return '';
  const d = device();
  if (d.standalone) return '';
  if (d.canInstall) return `<div class="banner soft" role="status">${icon('plus')}<span><b>Add K-9 Salon to your home screen</b> so it opens like an app.</span><button class="btn sm primary" data-action="install-app">Add</button><button class="btn sm ghost" data-action="install-later">Not now</button></div>`;
  if (d.ios && d.touch) return `<div class="banner soft" role="status">${icon('plus')}<span><b>To add K-9 Salon to your home screen,</b> tap Share, then Add to Home Screen. Open it from there and scan the code once more: iPhone keeps home screen apps separate from Safari.</span><button class="btn sm ghost" data-action="install-off">OK</button></div>`;
  return '';
}
async function installApp() {
  const ok = await window.k9.install().catch(() => false);
  if (ok) { store.set('k9.installHint', 'off'); toast('K-9 Salon is on your home screen.'); }
  renderBanners();
}
