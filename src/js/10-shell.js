/* ───────── chrome: sidebar, title bar, banners ───────── */
const TITLES = { home: 'Home', dogs: 'Dogs', breeding: 'Breeding', records: 'Records', reports: 'Reports', settings: 'Settings' };
function navGroup() { return S.view === 'log' ? 'records' : S.view; }
function renderNav() {
  const active = DOGS.filter(isActive).length;
  const g = navGroup();
  $('#nav').innerHTML = NAV.map(n => `<button data-action="nav" data-view="${n.id}" ${g === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span>${n.id === 'dogs' && S.db ? `<span class="ct" aria-label="${active} active dogs">${active}</span>` : ''}</button>`).join('');
  const lic = farmInfo('Licence Number');
  $('#brand-sub').textContent = lic ? `Licence ${lic}` : 'Kennel records';
  // on a phone the main sections sit along the bottom, and More opens the full list
  const tabs = NAV.filter(n => ['home', 'dogs', 'breeding', 'records'].includes(n.id));
  const open = $('#shell').classList.contains('nav-open');
  $('#tabbar').innerHTML = tabs.map(n => `<button data-action="nav" data-view="${n.id}" ${g === n.id ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></button>`).join('')
    + `<button data-action="menu" aria-controls="rail" aria-expanded="${open}" ${tabs.some(n => n.id === g) ? '' : 'aria-current="true"'}>${icon('menu')}<span>More</span></button>`;
}
function renderSync() {
  const c = S.conn;
  let dot = 'busy', main = 'Connecting to Google Sheets', sub = 'Loading your sheet';
  if (c.state === 'live') { dot = 'ok'; main = 'Up to date'; sub = `Synced with Google Sheets at ${clock(c.at)}`; }
  else if (c.state === 'setup') { dot = 'warn'; main = 'Not connected yet'; sub = 'Set up the link to your sheet'; }
  else if (c.state === 'saving') { dot = 'busy'; main = 'Saving…'; sub = 'Writing to Google Sheets'; }
  else if (c.state === 'stale') { dot = 'warn'; main = 'Showing the last copy'; sub = c.msg; }
  else if (c.state === 'error') { dot = 'crit'; main = 'Not connected'; sub = c.msg; }
  $('#sync').innerHTML = `<span class="dot ${dot}" aria-hidden="true"></span><span><b>${esc(main)}</b><small>${esc(sub)}</small></span>`;
  $('#sync').setAttribute('aria-label', `${main}. ${sub}. Open connection settings.`);
  const mini = $('#sync-mini');
  mini.innerHTML = `${icon('sync')}<span class="dot ${dot}" aria-hidden="true"></span>`;
  mini.setAttribute('aria-label', `${main}. ${sub}. Reload.`);
  mini.title = `${main}. Tap to reload.`;
}
function renderTop() {
  const L = LOG[S.tab];
  const title = S.conn.state === 'setup' ? 'Set up' : S.view === 'log' ? (L ? L.label : S.tab) : TITLES[S.view] || 'Home';
  $('#title').textContent = title;
  document.title = `${title} · K-9 Salon Manager`;
  const btn = (action, label, ico, extra = '', primary = true) => `<button class="btn ${primary ? 'primary' : ''}" data-action="${action}" ${extra}>${icon(ico)}<span class="lbl">${esc(label)}</span></button>`;
  let act = '';
  if (S.db) {
    if (S.view === 'dogs') act = btn('quick-fill', 'Quick fill', 'sheet', '', false) + btn('add-dog', 'Add a dog', 'plus');
    else if (S.view === 'breeding') act = btn('new-entry', 'Record a mating', 'plus', 'data-tab="Mating Records"', false) + btn('litter', 'Record a litter', 'litter');
    else if (S.view === 'records') act = btn('bulk', 'Log for many dogs', 'many');
    else if (S.view === 'log' && L && !L.readOnly && S.db[S.tab]) act = (L.bulk ? btn('bulk', 'Log for many dogs', 'many', `data-tab="${esc(S.tab)}"`, false) : '') + btn('new-entry', `New ${L.noun}`, 'plus', `data-tab="${esc(S.tab)}"`);
  }
  $('#top-act').innerHTML = act;
}
function renderBanners() {
  const out = [];
  const u = S.update;
  if (u.state === 'ready' && !S.updateDismissed) out.push(`<div class="banner acc" role="status">${icon('sync')}<span><b>Version ${esc(u.version)} is ready.</b> ${WEB ? 'Reload to start using it.' : 'Restart the app to finish updating.'}</span><button class="btn sm primary" data-action="update-install">${WEB ? 'Reload now' : 'Restart now'}</button><button class="btn sm ghost" data-action="update-later">Later</button></div>`);
  // the bridge is updated from a computer, so the phone only says so
  const onComputer = 'Update it from K-9 Salon Manager on the computer: Settings, then Connection.';
  if (S.db && S.bridgeVersion < NEED_BRIDGE) out.push(`<div class="banner warn" role="status">${icon('info')}<span><b>Update your bridge script</b> to turn on bulk logging, litters, photos, reminders, change history and shared settings. ${WEB ? onComputer : 'It takes about 3 minutes.'}</span>${WEB ? '' : '<button class="btn sm" data-action="bridge-help">Show me how</button>'}</div>`);
  else if (S.db && S.bridgeVersion < BRIDGE_LATEST && !S.bridgeLater) out.push(`<div class="banner soft" role="status">${icon('info')}<span><b>A bridge update is ready.</b> ${esc(bridgeNews())} ${WEB ? onComputer : 'About 3 minutes.'}</span>${WEB ? '' : '<button class="btn sm" data-action="bridge-help">Show me how</button>'}<button class="btn sm ghost" data-action="bridge-later">Later</button></div>`);
  if (WEB) out.push(installBannerHTML());
  $('#banners').innerHTML = out.join('');
}
function renderAll() {
  renderNav(); renderSync(); renderTop(); renderBanners(); renderView();
  refreshDrawer();
}
function renderView() {
  const v = $('#view');
  if (!S.db && S.view !== 'settings') { v.innerHTML = connectState(); return; }
  const fn = { home: viewHome, dogs: viewDogs, breeding: viewBreeding, records: viewRecords, log: viewLog, reports: viewReports, settings: viewSettings }[S.view] || viewHome;
  v.innerHTML = fn();
  afterViewRender();
}
function afterViewRender() {
  if (S.view === 'dogs') refreshDogTable();
  if (S.view === 'log') refreshLogTable();
  if (S.view === 'reports') afterReports();
  if (S.view === 'settings') afterSettings();
}
function go(view, tab) {
  if (view !== 'settings') hidePhoneCode(); // the connection code never stays on screen behind you
  S.view = view; S.tab = view === 'log' ? tab : null;
  if (view === 'log') S.logQ = '';
  store.set('k9.view', view); store.set('k9.tab', tab || '');
  closeNav();
  renderNav(); renderTop(); renderView();
  $('#main').scrollTop = 0;
  const v = $('#view'); if (v) v.focus({ preventScroll: true });
}

/* ───────── overlays (drawer, dialogs, search) ───────── */
const OV = [];
function pushOverlay(kind, inner, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ov';
  wrap.style.zIndex = String(40 + OV.length * 2);
  wrap.innerHTML = `<div class="scrim" data-action="close-top"></div>${inner}`;
  document.body.appendChild(wrap);
  const o = { kind, el: wrap, prevFocus: document.activeElement, ...opts };
  OV.push(o);
  syncBack();
  $('#shell').setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    if (wrap.contains(document.activeElement)) return;
    const f = wrap.querySelector('[autofocus]') || wrap.querySelector('.m-b input:not([type=hidden]):not([disabled]):not(.sr), .m-b select:not([disabled]), .m-b textarea') || wrap.querySelector('input:not([type=hidden]),select,textarea,button:not(.scrim)');
    if (f) f.focus();
  }, 30);
  return o;
}
function closeTop(force) {
  const o = OV[OV.length - 1];
  if (!o) return;
  if (!force && o.guard && !o.guard()) return;
  OV.pop();
  o.el.classList.add('leaving');
  setTimeout(() => o.el.remove(), 150);
  if (o.onClose) o.onClose();
  if (!OV.length) $('#shell').removeAttribute('aria-hidden');
  if (o.prevFocus && o.prevFocus.focus && document.contains(o.prevFocus)) o.prevFocus.focus();
  syncBack();
}
/* On a phone, the Back button (or gesture) closes what's open, instead of leaving the app.
   While a dialog, profile or the sections menu is open there is one extra history entry for Back to use up. */
// The entry is matched up after the current step, so closing one dialog and opening another (a search result, say)
// leaves it in place; and nothing new is added while the app's own step back is still under way.
let backEntry = false, backPending = false, backQueued = false, backTimer = null;
const isOpen = () => OV.length > 0 || $('#shell').classList.contains('nav-open');
function syncBack() {
  if (!WEB || backQueued) return;
  backQueued = true;
  setTimeout(() => {
    backQueued = false;
    if (backPending) return; // finishes when the step back arrives
    if (isOpen() && !backEntry) { try { history.pushState({ k9: 'open' }, ''); backEntry = true; } catch (e) { /* history unavailable */ } }
    else if (!isOpen() && backEntry) {
      backEntry = false; backPending = true;
      history.back();
      backTimer = setTimeout(() => { backPending = false; syncBack(); }, 1500); // in case the step back never arrives
    }
  }, 0);
}
// reopened on the app's extra entry (a reload, or a phone bringing the tab back) with nothing open: step back off it
if (WEB && history.state && history.state.k9 === 'open') { backEntry = true; syncBack(); }
window.addEventListener('popstate', e => {
  if (!WEB) return;
  backEntry = !!(e.state && e.state.k9 === 'open');
  if (backPending) { backPending = false; clearTimeout(backTimer); syncBack(); return; } // the app's own step back
  if (!backEntry) { if (OV.length) closeTop(); else closeNav(); } // Back pressed: close what's on top
  syncBack(); // something is still open (another dialog, or a form with unsaved changes), so Back keeps working
});
const topOverlay = kind => { const o = OV[OV.length - 1]; return o && (!kind || o.kind === kind) ? o : null; };
/** Keeps Tab and Shift+Tab inside the dialog that is on top. */
function trapFocus(e) {
  const o = OV[OV.length - 1];
  if (e.key !== 'Tab') return;
  // the sections menu, when it slides over a narrow window, holds the focus the same way
  const box = o ? o.el : $('#shell').classList.contains('nav-open') ? $('#rail') : null;
  if (!box) return;
  const items = $$('a[href],button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])', box).filter(x => x.offsetParent !== null && !x.classList.contains('scrim'));
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); return; }
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function modal(kind, { title, sub = '', body, foot = '', wide = false, narrow = false, form = false, guard }) {
  const tag = form ? 'form' : 'div';
  return pushOverlay(kind, `<div class="modal"><${tag} class="mcard${wide ? ' wide' : ''}${narrow ? ' narrow' : ''}" role="dialog" aria-modal="true" aria-labelledby="m-title-${OV.length}" ${form ? 'novalidate' : ''}>
    <div class="m-h"><div style="flex:1;min-width:0"><h2 id="m-title-${OV.length}">${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button type="button" class="iconbtn" data-action="close-top" aria-label="Close">${icon('x')}</button></div>
    <div class="m-b">${body}</div>${foot ? `<div class="m-f">${foot}</div>` : ''}
  </${tag}></div>`, { guard });
}

function toast(msg, err) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.setAttribute('role', err ? 'alert' : 'status');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 200); }, err ? 8000 : 4000);
}
async function copyText(text, label) {
  try { await window.k9.copy(text); toast(label || `Copied ${text}`); }
  catch (e) { toast(WEB ? 'Couldn’t copy. Press and hold the text to copy it instead.' : 'Couldn’t copy. Select the text and press Ctrl+C instead.', true); }
}

/* ───────── search (Ctrl+K) ───────── */
function openPalette(initial = '') {
  if (topOverlay('palette')) return;
  const o = pushOverlay('palette', `<div class="palette" role="dialog" aria-modal="true" aria-label="Find a dog or record">
    <div class="pal-in">${icon('search', 'muted')}<label class="sr" for="pal-q">Find a dog or record</label><input id="pal-q" autofocus placeholder="Name, animal ID, microchip, or what you want to do" autocomplete="off" value="${esc(initial)}" role="combobox" aria-controls="pal-list" aria-expanded="true"><kbd>Esc</kbd></div>
    <div class="pal-list" id="pal-list" role="listbox" aria-label="Results"></div>
    <div class="pal-foot"><span>↑ ↓ to move · Enter to open</span><span>${icon('scan')} Scanning a microchip opens that dog</span></div></div>`);
  o.sel = 0;
  const input = $('#pal-q', o.el);
  const draw = () => { o.items = paletteItems(input.value); o.sel = Math.min(o.sel, Math.max(0, o.items.length - 1)); drawPalette(o); };
  input.addEventListener('input', () => { o.sel = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); o.sel = Math.min(o.items.length - 1, o.sel + 1); drawPalette(o); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); o.sel = Math.max(0, o.sel - 1); drawPalette(o); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = o.items[o.sel]; if (it) runPalette(it); }
  });
  draw();
}
function paletteItems(q) {
  q = q.trim().toLowerCase();
  const qd = normChip(q);
  const items = [];
  const match = s => !q || s.toLowerCase().includes(q);
  if (S.db) {
    DOGS.filter(d => !q || `${d.name} ${d.id} ${d.breed}`.toLowerCase().includes(q) || (qd.length >= 3 && d.chip.includes(qd)))
      .sort((a, b) => (qd.length >= 3 ? (b.chip === qd) - (a.chip === qd) : 0) || (isActive(b) - isActive(a)))
      .slice(0, q ? 12 : 5)
      .forEach(d => items.push({ g: 'Dogs', t: dogName(d), s: `${d.id} · ${titleCase(d.breed)}${d.chip ? ' · ' + d.chip : ''}`, run: () => openDog(d.chip, d.id) }));
    const acts = [
      ['Log for many dogs', 'bulk vaccinate deworm many group', () => openBulk()],
      ['Quick fill dog details', 'quick fill licence licences kennel kennels sterilised status table many dogs', () => openQuickFill()],
      ['Record a litter', 'litter puppies whelp birth', () => openLitter()],
      ['Add a dog', 'add new dog', () => openForm({ tab: MASTER, mode: 'new' })],
      ['Monthly AVS report', 'avs monthly report submission', () => { S.reportTab = 'monthly'; go('reports'); }],
      ['Change history', 'history changes log audit', () => { S.reportTab = 'changes'; go('reports'); }],
    ];
    acts.filter(([t, k]) => match(t + ' ' + k)).forEach(([t, , run]) => items.push({ g: 'Do something', t, s: '', run }));
    LOGS.filter(L => S.db[L.tab] && !L.readOnly && match(`new ${L.noun} ${L.label}`)).slice(0, q ? 8 : 3)
      .forEach(L => items.push({ g: 'Do something', t: `New ${L.noun}`, s: `Saves to “${L.tab}”`, run: () => openForm({ tab: L.tab, mode: 'new' }) }));
  }
  NAV.filter(n => match(n.label)).forEach(n => items.push({ g: 'Go to', t: n.label, s: '', run: () => go(n.id) }));
  if (S.db && q) LOGS.filter(L => S.db[L.tab] && match(L.label)).forEach(L => items.push({ g: 'Go to', t: L.label, s: `Tab “${L.tab}”`, run: () => go('log', L.tab) }));
  return items;
}
function drawPalette(o) {
  let g = '';
  $('#pal-list', o.el).innerHTML = o.items.length ? o.items.map((it, i) => { const h = it.g !== g ? `<div class="pal-group" role="presentation">${esc(it.g)}</div>` : ''; g = it.g; return `${h}<button class="pal-item" role="option" id="pal-${i}" data-pal="${i}" aria-selected="${i === o.sel}"><span class="t">${esc(it.t)}</span><small>${esc(it.s)}</small></button>`; }).join('')
    : `<div class="pal-group">No matches</div><div style="padding:6px 12px 14px" class="muted">Try a name, an animal ID like A042, or the last digits of a microchip.</div>`;
  const input = $('#pal-q', o.el);
  if (input) input.setAttribute('aria-activedescendant', o.items.length ? `pal-${o.sel}` : '');
  const s = $(`[data-pal="${o.sel}"]`, o.el); if (s) s.scrollIntoView({ block: 'nearest' });
}
function runPalette(it) { closeTop(true); it.run(); }

/* ───────── narrow-window menu (More, on a phone) ───────── */
let navOpener = null;
function toggleNav(btn) {
  const sh = $('#shell');
  if (sh.classList.contains('nav-open')) return closeNav();
  sh.classList.add('nav-open');
  navOpener = btn || null;
  const s = document.createElement('div'); s.className = 'nav-scrim'; s.id = 'nav-scrim'; s.addEventListener('click', () => closeNav()); document.body.appendChild(s);
  $$('[data-action="menu"]').forEach(b => b.setAttribute('aria-expanded', 'true'));
  setTimeout(() => { const f = $('#nav button[aria-current="page"]') || $('#nav button'); if (f && sh.classList.contains('nav-open')) f.focus(); }, 60);
  syncBack();
}
function closeNav() {
  const sh = $('#shell');
  const was = sh.classList.contains('nav-open');
  sh.classList.remove('nav-open');
  const s = $('#nav-scrim'); if (s) s.remove();
  $$('[data-action="menu"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  if (was && navOpener && document.contains(navOpener) && $('#rail').contains(document.activeElement)) navOpener.focus();
  navOpener = null;
  if (was) syncBack();
}
