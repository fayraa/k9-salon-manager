/* ───────── events ───────── */
function scrollToSection(id) { setTimeout(() => { const el = document.getElementById(id); if (el) { el.scrollIntoView({ block: 'start' }); const f = el.querySelector('input,select,button'); if (f) f.focus({ preventScroll: true }); } }, 30); }
document.addEventListener('click', e => {
  const pal = e.target.closest('[data-pal]');
  if (pal) { const o = topOverlay('palette'); if (o) runPalette(o.items[+pal.dataset.pal]); return; }
  const a = e.target.closest('[data-action]');
  if (!a || a.tagName === 'A') return;
  const act = a.dataset.action;
  switch (act) {
    case 'nav': if (OV.length && !OV.some(o => o.job && o.job.dirty)) while (OV.length) closeTop(true); go(a.dataset.view, a.dataset.tab); if (a.dataset.anchor) scrollToSection('set-' + a.dataset.anchor); break;
    case 'open-dog': openDog(a.dataset.chip || '', a.dataset.id); break;
    case 'close-top': closeTop(); break;
    case 'palette': openPalette(); break;
    case 'new-entry': openForm({ tab: a.dataset.tab, mode: 'new', preset: { chip: a.dataset.chip || '' } }); break;
    case 'edit-row': editRow(a.dataset.tab, +a.dataset.r); break;
    case 'add-dog': openForm({ tab: MASTER, mode: 'new' }); break;
    case 'edit-dog': editRow(MASTER, +a.dataset.r); break;
    case 'bulk': openBulk(a.dataset.tab); break;
    case 'quick-fill': openQuickFill({ preset: a.dataset.preset, issue: a.dataset.issue }); break;
    case 'bridge-later': S.bridgeLater = true; renderBanners(); break;
    case 'doc-add': openDocAdd(a.dataset.chip || '', a.dataset.id, a.dataset.type); break;
    case 'doc-open': openDocFile(a.dataset.doc, a); break;
    case 'doc-remove': askDocRemove(a.dataset.doc); break;
    case 'doc-remove-yes': removeDoc(a.dataset.doc, a); break;
    case 'litter': openLitter(a.dataset.chip || ''); break;
    case 'move-dog': openMoveDog(a.dataset.kennel); break;
    case 'filter-issue': S.dogs = Object.assign({}, S.dogs, { issue: a.dataset.issue, status: 'all', q: '', breed: '', sex: '' }); S.dogsMode = 'list'; go('dogs'); break;
    case 'clear-issue': S.dogs.issue = ''; renderView(); break;
    case 'dogs-status': S.dogs.status = a.dataset.status; S.dogsMode = 'list'; if (S.view !== 'dogs') go('dogs'); else { renderView(); } break;
    case 'dogs-mode': S.dogsMode = a.dataset.mode; store.set('k9.dogsMode', S.dogsMode); renderView(); break;
    case 'sort': { const k = a.dataset.sort; S.dogs.dir = S.dogs.sort === k ? -S.dogs.dir : 1; S.dogs.sort = k; refreshDogTable(); break; }
    case 'report-tab': S.reportTab = a.dataset.tab; if (S.view !== 'reports') go('reports'); else { renderView(); const t = $(`#rt-${S.reportTab}`); if (t) t.focus(); } break;
    case 'pdf-month': pdfMonth(); break;
    case 'pdf-due': pdfDue(); break;
    case 'pdf-dog': pdfDog(a.dataset.chip, a.dataset.id); break;
    case 'mark-submitted': markSubmitted(); break;
    case 'copy': copyText(a.dataset.copy); break;
    case 'copy-script': copyScript(a.dataset.from ? $('#' + a.dataset.from) : null); break;
    case 'open-connection': closeNav(); if (OV.length && !OV.some(o => o.job && o.job.dirty)) while (OV.length) closeTop(true); go('settings'); scrollToSection('set-connection'); break;
    case 'bridge-help': if (topOverlay('need')) closeTop(true); openBridgeHelp(); break;
    case 'reload': reload(); break;
    case 'reload-close': closeTop(true); reload(); break;
    case 'menu': toggleNav(a); break;
    case 'phone-code': showPhoneCode(true); break;
    case 'phone-code-hide': showPhoneCode(false); break;
    case 'scan-connect': scanConnect(); break;
    case 'file-share': shareFile(); break;
    case 'install-app': installApp(); break;
    case 'install-later': S.installLater = true; renderBanners(); break;
    case 'install-off': store.set('k9.installHint', 'off'); renderBanners(); break;
    case 'date-add': dateAdd(a); break;
    case 'guard-keep': { const g = a.closest('.guard'); if (g) g.remove(); break; }
    case 'guard-discard': closeTop(true); break;
    case 'save-shared': saveShared(a.dataset.part, a); break;
    case 'digest-test': digestTest(a); break;
    case 'serial-on': serialConnect(true); break;
    case 'serial-off': serialDisconnect(); break;
    case 'update-check': window.k9.updateCheck(); break;
    case 'update-install': window.k9.updateInstall(); break;
    case 'update-later': S.updateDismissed = true; renderBanners(); break;
    default: break;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Tab') { trapFocus(e); return; }
  const tr = e.target.closest && e.target.closest('tr[data-action]');
  if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); return; }
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
  if (e.key === 'F5' || (mod && e.key.toLowerCase() === 'r')) { e.preventDefault(); reload(); return; }
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); stepTextSize(1); return; }
  if (mod && e.key === '-') { e.preventDefault(); stepTextSize(-1); return; }
  if (mod && e.key === '0') { e.preventDefault(); stepTextSize(0); return; }
  if (e.key === 'Escape') { if (OV.length) { e.preventDefault(); closeTop(); } else closeNav(); return; }
  const inField = /INPUT|SELECT|TEXTAREA/.test((e.target.tagName || '')) || e.target.isContentEditable;
  if (!inField && e.key === '/' && !OV.length) { e.preventDefault(); openPalette(); return; }
  if (!inField) keyboardScanner(e);
});
document.addEventListener('input', e => {
  if (e.target.id === 'dog-q') { S.dogs.q = e.target.value; refreshDogTable(); }
  if (e.target.id === 'log-q') { S.logQ = e.target.value; refreshLogTable(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'dog-breed') { S.dogs.breed = e.target.value; refreshDogTable(); }
  if (e.target.id === 'dog-sex') { S.dogs.sex = e.target.value; refreshDogTable(); }
  if (e.target.id === 'dog-sort') { S.dogs.sort = e.target.value; S.dogs.dir = 1; refreshDogTable(); }
  if (e.target.id === 'photo-in') uploadPhoto(e.target);
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'setup-form' || f.id === 'conn-form') { e.preventDefault(); submitConnForm(f); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.db && !S.saving && Date.now() - S.conn.at > 120000) deskLoad();
});
// turning a phone or resizing a window between phone and wider layouts redraws lists as cards or tables
if (PHONE_MQ && PHONE_MQ.addEventListener) PHONE_MQ.addEventListener('change', () => {
  if (!S.db || !['dogs', 'log'].includes(S.view)) return;
  const id = document.activeElement && document.activeElement.id;
  renderView();
  const back = id && document.getElementById(id);
  if (back) back.focus({ preventScroll: true });
});

/* ───────── start ───────── */
(async () => {
  const p = await window.k9.getPrefs().catch(() => ({}));
  S.prefs = Object.assign(clone(DEFAULT_PREFS), p || {});
  S.prefs.scanner = Object.assign(clone(DEFAULT_PREFS.scanner), (p && p.scanner) || {});
  S.version = await window.k9.version().catch(() => '');
  S.phoneUrl = window.k9.phoneUrl ? await window.k9.phoneUrl().catch(() => '') : '';
  applyDisplay();
  const savedView = store.get('k9.view');
  if (savedView && (NAV.some(n => n.id === savedView) || savedView === 'log')) { S.view = savedView; S.tab = store.get('k9.tab') || null; if (S.view === 'log' && !S.tab) S.view = 'home'; }
  S.dogsMode = store.get('k9.dogsMode') === 'kennels' ? 'kennels' : 'list';
  renderAll();
  window.k9.onUpdate(onUpdateState);
  window.k9.onSerialPorts(chooseSerialPort);
  window.k9.getUpdateState().then(onUpdateState).catch(() => {});
  if (window.k9.onDevice) window.k9.onDevice(() => { renderBanners(); if (S.view === 'settings' && !OV.length) { const y = $('#main').scrollTop; renderView(); $('#main').scrollTop = y; } });
  connect();
  if (S.prefs.scanner.serial) serialConnect(false);
  // the phone version opened from the code on the computer: offer to connect
  const link = window.k9.takeLink ? window.k9.takeLink() : null;
  if (link) handleConnectLink(link);
})();
