/* ───────── talking to the bridge script ───────── */
const DESK_COPY = {
  not_setup: 'Connect the app to your sheet to get started.',
  bad_key: 'The access key doesn’t match the bridge script. Check the key in Settings → Connection, or run setupAppBridge in Apps Script to see it again.',
  no_key: 'The bridge script hasn’t been set up yet. In Apps Script, run setupAppBridge once, then try again.',
  bad_url: 'That address isn’t an Apps Script web app link. It should start with https://script.google.com/macros/s/ and end with /exec.',
  bad_reply: 'Google sent back a web page instead of data. Check the bridge is deployed as a Web app with “Who has access” set to Anyone, and that you copied the Web app URL ending in /exec.',
  network: 'Couldn’t reach Google. Check the internet connection, then try again.',
  timeout: 'Google took too long to answer. Try again in a moment.',
  row_changed: 'This row was changed in the sheet after you opened it, so nothing was saved. The latest data is loading now. Open the entry again and redo your change.',
  row_moved: 'That row is no longer in the sheet, so nothing was saved. The latest data is loading now.',
  locked: 'Another save was still running. Wait a moment and save again.',
  bad_action: 'Your bridge script is out of date for this. Update the bridge script (Settings → Connection) and try again.',
  changed_after_save: 'This was already saved a moment ago, before your latest changes. The latest data is loading now. Open the entry again to make more changes.',
  protected: 'That tab is kept by the app itself and can’t be edited here.',
};
const UNCONFIRMED = 'Google didn’t confirm the save, so it may or may not have gone through. Press Save again: if it already went through, it won’t be saved twice.';
function deskText(res) {
  const code = res && res.error;
  if (code === 'server') return `The bridge script reported a problem: ${res.message || 'unknown error'}`;
  if (code === 'no_tab') return res.message || 'A tab the app needs is missing from the sheet.';
  if (['no_column', 'invalid', 'refused'].includes(code) && res.message) return res.message;
  return DESK_COPY[code] || (res && res.message) || 'Something went wrong talking to Google Sheets.';
}
async function deskCall(payload) {
  try { return await window.k9.call(Object.assign({ who: S.prefs.who || '' }, payload)); }
  catch (e) { return { ok: false, error: 'network', message: String((e && e.message) || e) }; }
}
const wanted = () => [MASTER, ...LOGS.map(l => l.tab), CHANGE_TAB];
// newest rows only, for tabs that grow every day
const READ_LIMITS = { 'Daily Health Monitoring': 4000, 'Visitor Log': 2000, 'Form_Responses': 1000 };
/** Sends a save or batch; the same opId on a retry means the bridge won't save twice. */
async function sendWrite(payload, opId) {
  const body = Object.assign({}, payload, { opId });
  body.opHash = hashOf(payload);
  const res = await deskCall(body);
  if (!res || !res.ok) {
    const code = (res && res.error) || 'network';
    const msg = AMBIGUOUS.includes(code) ? UNCONFIRMED : deskText(res || {});
    throw userErr(msg, { code, index: res && typeof res.index === 'number' ? res.index : null, refresh: AMBIGUOUS.includes(code) || ['row_changed', 'row_moved', 'changed_after_save', 'refused'].includes(code), keepOp: AMBIGUOUS.includes(code) });
  }
  return res;
}
function skippedNote(list) {
  const names = Array.from(new Set((list || []).filter(Boolean)));
  if (names.length) toast(`Not saved because the sheet works ${names.length === 1 ? 'it' : 'them'} out: ${names.join(', ')}.`, true);
}

async function connect() {
  clearInterval(S.poll);
  if (!S.prefs.url || !S.prefs.key) { S.conn = { state: 'setup', code: 'not_setup', msg: DESK_COPY.not_setup, at: 0 }; renderAll(); return; }
  S.conn = { state: S.db ? 'stale' : 'starting', code: '', msg: S.db ? 'Refreshing…' : '', at: S.conn.at };
  renderSync(); if (!S.db) renderView();
  await deskLoad();
  S.poll = setInterval(() => { if (document.visibilityState === 'visible' && !S.saving && !OV.some(o => o.job && o.job.saving)) deskLoad(); }, 120000);
}
let deskLoading = null;
function deskLoad() {
  if (deskLoading) return deskLoading;
  deskLoading = (async () => {
    const res = await deskCall({ action: 'read', tabs: wanted(), limits: READ_LIMITS, v: 2 });
    deskLoading = null;
    if (!res || !res.ok) {
      const code = (res && res.error) || 'network';
      if (code === 'not_setup') { S.conn = { state: 'setup', code, msg: DESK_COPY.not_setup, at: 0 }; renderAll(); return; }
      if (S.db) { S.conn.state = 'stale'; S.conn.code = code; S.conn.msg = deskText(res); renderSync(); return; }
      S.conn = { state: 'error', code, msg: deskText(res), at: 0 }; renderAll(); return;
    }
    S.sheetTitle = res.title || 'Google Sheet';
    if (res.url) { S.sheetUrl = res.url; const id = sheetIdFrom(res.url); if (id && id !== S.prefs.sheetId) setPrefs({ sheetId: id }); }
    S.bridgeVersion = res.version || 1;
    if (res.settings) S.shared = mergeShared(res.settings);
    S.photos = res.photos || {};
    S.docs = Array.isArray(res.docs) ? res.docs : [];
    S.reminders = res.reminders || { installed: false };
    if (!res.tabs || !res.tabs[MASTER]) { S.conn = { state: 'error', code: 'no_master', msg: 'The spreadsheet has no “All Breeds” tab. Rename the main tab back to “All Breeds”.', at: 0 }; renderAll(); return; }
    applyDb(parseBridge(res), Date.now());
  })();
  return deskLoading;
}
function applyDb(db, at) {
  const first = !S.db;
  S.db = db;
  S.conn = { state: 'live', code: '', msg: '', at };
  rebuild();
  const active = document.activeElement;
  const typing = active && $('#view').contains(active) && /INPUT|SELECT|TEXTAREA/.test(active.tagName);
  if (typing) { renderNav(); renderSync(); renderTop(); renderBanners(); afterViewRender(); refreshDrawer(); }
  else renderAll();
  if (first) dailyNotice();
}
function dailyNotice() {
  if (!S.prefs.notify || store.get('k9.notified') === isoD(TODAY)) return;
  const items = upcoming(0);
  const late = items.filter(u => u.days < 0).length, today = items.filter(u => u.days === 0).length;
  store.set('k9.notified', isoD(TODAY));
  if (!late && !today) return;
  try {
    const n = new Notification('K-9 Salon', { body: [late ? `${late} overdue` : '', today ? `${today} due today` : ''].filter(Boolean).join(', ') + '. Open the app to see the list.', silent: false });
    n.onclick = () => { window.k9.focus(); go('home'); };
  } catch (e) { /* notifications unavailable */ }
}
let refreshTimer = null;
function scheduleRefresh(ms = 1200) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => deskLoad(), ms); }
async function reload() {
  if (topOverlay('conn')) closeTop(true);
  if (S.conn.state === 'setup' || !S.db) return connect();
  toast('Reloading from Google Sheets…');
  return deskLoad();
}

/** Saves one row. job: {tab, mode, row, cols, headers, orig, dog}; changes: [{h, c, v, kind}] */
async function saveRow(job, changes) {
  const t = S.db[job.tab];
  const computed = computedCols(job.tab);
  const out = changes.map(ch => { const c = ch.c != null ? ch.c : t.idx.get(ch.h); return { h: ch.h, k: c == null ? 0 : occOf(job.headers, c), v: ch.kind === 'chip' ? (normChip(ch.v) || ch.v) : ch.v, kind: ch.kind }; });
  if (job.mode === 'new' && S.bridgeVersion < NEED_BRIDGE) {
    // older bridge scripts don't number new rows, so the app does it
    t.headers.forEach((h, c) => {
      if (out.some(x => x.h === h)) return;
      if (job.tab === MASTER && h === 'Animal ID') out.push({ h, k: 0, v: nextAnimalId(), kind: 'text' });
      else if (SEQ_COL.test(h)) out.push({ h, k: 0, v: String(t.rows.reduce((m, r) => Math.max(m, +r.v[c] || 0), 0) + 1), kind: 'number' });
    });
  }
  const expect = job.mode === 'edit' ? job.cols.filter(c => !computed.has(c)).map(c => ({ h: job.headers[c], k: occOf(job.headers, c), v: expectVal(job.orig[c]), kind: t.kinds[c] })) : [];
  if (!job.opId) job.opId = newOpId();
  S.saving = true;
  const prev = S.conn.state; S.conn.state = 'saving'; renderSync();
  let res;
  try { res = await sendWrite({ action: 'save', tab: job.tab, mode: job.mode, row: job.row ? job.row.r : null, changes: out, expect, dog: job.dog || '' }, job.opId); }
  catch (e) { if (!e.keepOp) job.opId = null; throw e; }
  finally { S.saving = false; S.conn.state = prev === 'saving' ? 'live' : prev; renderSync(); }
  job.opId = null;
  skippedNote(res.skipped);
  const legacyId = out.find(x => x.h === 'Animal ID' && job.tab === MASTER && job.mode === 'new');
  return { row: res.row, id: res.id || (legacyId && S.bridgeVersion < NEED_BRIDGE ? legacyId.v : null) };
}

/* ───────── setup and the bridge script ───────── */
function sheetIdFrom(s) { const m = String(s || '').match(/\/d\/([a-zA-Z0-9_-]{25,})/) || String(s || '').match(/^([a-zA-Z0-9_-]{25,})$/); return m ? m[1] : ''; }
async function copyScript(sheetLinkInput) {
  let id = S.prefs.sheetId || sheetIdFrom(S.sheetUrl);
  if (sheetLinkInput) { const v = sheetIdFrom(sheetLinkInput.value); if (!v) { toast('Paste the link to your Google Sheet first (step 1).', true); sheetLinkInput.focus(); return; } id = v; setPrefs({ sheetId: id }); }
  if (!id) { toast('Paste the link to your Google Sheet first.', true); return; }
  try {
    const src = (await window.k9.bridgeScript()).replace("'__SHEET_ID__'", `'${id}'`);
    await window.k9.copy(src);
    toast('Bridge script copied. Paste it into your Apps Script project.');
  } catch (e) { toast('Couldn’t copy the script.', true); }
}
function connFields(st, id) {
  return `<form id="${id}" class="form-grid" novalidate>
    <div class="field wide"><label for="${id}-url">Web app URL</label><input class="inp" id="${id}-url" name="url" value="${esc(st.url || '')}" placeholder="https://script.google.com/macros/s/…/exec" spellcheck="false" autocomplete="off"></div>
    <div class="field wide"><label for="${id}-key">Access key</label><input class="inp mono" id="${id}-key" name="key" value="${esc(st.key || '')}" placeholder="Shown in the execution log after running setupAppBridge" spellcheck="false" autocomplete="off"></div>
    <div class="field wide row-inline"><button class="btn primary" type="submit">Connect</button><span class="muted set-msg" aria-live="polite">The URL and key are stored only on this computer.</span></div>
  </form>`;
}
function setupView() {
  return `<div class="setup">
  <div><h2>Connect K-9 Salon Manager to your Google Sheet</h2><p class="lede">The app reads and saves your kennel records through a small script that runs in your own Google account. You only do this once.</p></div>
  <ol class="steps">
    <li><div><b>Paste the link to your Google Sheet</b><p>Open your kennel records sheet in Google Sheets and copy the address from the browser.</p><div class="field" style="margin-top:10px"><label class="sr" for="setup-sheet">Google Sheet link</label><input class="inp" id="setup-sheet" placeholder="https://docs.google.com/spreadsheets/d/…/edit" value="${esc(S.prefs.sheetId ? `https://docs.google.com/spreadsheets/d/${S.prefs.sheetId}/edit` : '')}" autocomplete="off" spellcheck="false"></div></div></li>
    <li><div><b>Create the bridge script</b><p>Open Google Apps Script and make a <b>New project</b>. Delete the sample code, paste the bridge script, rename the project “K-9 Salon App Bridge” and press Ctrl+S.</p><div class="row"><button class="btn primary sm" data-action="copy-script" data-from="setup-sheet">${icon('copy')}Copy bridge script</button><a class="btn sm" href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">${icon('ext')}Open Apps Script</a></div></div></li>
    <li><div><b>Give it permission</b><p>Choose <code>setupAppBridge</code> in the function menu at the top and click <b>Run</b>. Approve access when Google asks. If it says the app isn’t verified, click <b>Advanced</b>, then <b>Go to K-9 Salon App Bridge</b>; it’s your own script. The execution log at the bottom then shows your <b>access key</b>.</p></div></li>
    <li><div><b>Publish it as a web app</b><p>Click <b>Deploy → New deployment</b>, click the gear beside “Select type” and pick <b>Web app</b>. Set <b>Execute as: Me</b> and <b>Who has access: Anyone</b>, click <b>Deploy</b>, then copy the <b>Web app URL</b>.</p></div></li>
    <li><div><b>Paste both here</b><div style="margin-top:12px">${connFields(S.prefs, 'setup-form')}</div></div></li>
  </ol>
  <p class="muted small">Anyone with both the URL and the key could read and change the sheet, so keep them private. To change the key, run <code>resetAppKey</code> in the script and paste the new key here.</p>
  </div>`;
}
/** What updating the bridge would add, from the version in use now. */
function bridgeNews() {
  const v = S.bridgeVersion || 1, parts = [];
  if (v < NEED_BRIDGE) parts.push('bulk logging, litters, dog photos, reminder emails, change history and shared settings');
  if (v < DOC_BRIDGE) parts.push('documents for each dog (photos and PDFs of records and import papers)');
  if (v < 3) parts.push('your sheet’s dropdown lists in the app');
  return parts.length ? `The update adds ${parts.join(', and ')}.` : 'It’s up to date.';
}
function openBridgeHelp() {
  modal('bridge', {
    title: 'Update the bridge script', narrow: false,
    sub: `Your bridge is version ${S.bridgeVersion || 1}. ${bridgeNews()}`,
    body: `<ol class="steps compact">
      <li><div><b>Copy the new script</b><p>Your sheet’s ID is filled in for you.</p><div class="row"><button class="btn primary sm" data-action="copy-script">${icon('copy')}Copy bridge script</button></div></div></li>
      <li><div><b>Replace the old code</b><p>Open your <b>K-9 Salon App Bridge</b> project at script.google.com, select all the code (Ctrl+A), paste (Ctrl+V) and save (Ctrl+S).</p><div class="row"><a class="btn sm" href="https://script.google.com/home" target="_blank" rel="noopener">${icon('ext')}Open Apps Script</a></div></div></li>
      <li><div><b>Approve any new permissions</b><p>Choose <code>setupAppBridge</code> and click <b>Run</b>. If Google asks for access (Drive for dog photos, Gmail for reminder emails, triggers for the daily schedule), approve it. Your access key stays the same.</p></div></li>
      <li><div><b>Publish the new version</b><p>Click <b>Deploy → Manage deployments</b>, click the pencil icon, set <b>Version</b> to <b>New version</b> and click <b>Deploy</b>. The web app URL doesn’t change.</p></div></li>
      <li><div><b>Reload</b><p>Come back here and press <b>Reload</b>. The notice about the bridge disappears when it worked.</p><div class="row"><button class="btn sm" data-action="reload-close">${icon('sync')}Reload</button></div></div></li>
    </ol>`,
    foot: `<span class="msg"></span><button class="btn" data-action="close-top">Close</button>`,
  });
}
async function submitConnForm(f) {
  const url = f.elements.url.value.trim(), key = f.elements.key.value.trim();
  const msg = $('.set-msg', f), btn = $('button[type=submit]', f);
  const say = (t, bad) => { msg.textContent = t; msg.classList.toggle('crit-t', !!bad); };
  if (!url || !key) return say('Paste both the web app URL and the access key.', true);
  btn.disabled = true; btn.textContent = 'Connecting…'; say('Checking with Google…');
  const res = await window.k9.test({ url, key }).catch(() => ({ ok: false, error: 'network' }));
  btn.disabled = false; btn.textContent = 'Connect';
  if (!res || !res.ok) return say(deskText(res || {}), true);
  const saved = await window.k9.setPrefs({ url, key }).catch(() => ({ ok: false }));
  if (!saved || !saved.ok) return say(deskText(saved || {}), true);
  S.prefs.url = url; S.prefs.key = key;
  toast(`Connected to “${res.title || 'your sheet'}”${res.version < BRIDGE_LATEST ? '. Your bridge script has an update available.' : ''}`);
  if (topOverlay('conn')) closeTop(true);
  S.db = null;
  if (S.view === 'settings') S.view = 'home';
  connect();
}
