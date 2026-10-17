/* ───────── settings ───────── */
const TEXT_SIZES = [[1, 'Normal'], [1.15, 'Large'], [1.3, 'Extra large']];
const BAUDS = [9600, 19200, 38400, 57600, 115200];
function radios(name, opts, cur) {
  return `<div class="radios" role="radiogroup" aria-label="${esc(name)}">${opts.map(([v, l]) => `<label class="radio"><input type="radio" name="${esc(name)}" value="${esc(v)}" ${String(v) === String(cur) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
}
function toggle(id, label, on, hint = '', disabled = false) {
  return `<label class="toggle" for="${id}"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span class="tg" aria-hidden="true"></span><span class="tg-t"><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span></label>`;
}
function numField(id, label, val, hint, min, max) {
  return `<div class="field"><label for="${id}">${esc(label)}</label><input class="inp" type="number" id="${id}" min="${min}" max="${max}" step="1" value="${val == null ? '' : esc(val)}" placeholder="No limit"><span class="hint">${esc(hint)}</span></div>`;
}
function viewSettings() {
  const P = S.prefs, X = S.shared, B = X.breeding || {}, Rm = X.reminders || {};
  const can = S.bridgeVersion >= NEED_BRIDGE;
  const lockNote = can ? '' : `<p class="note">${icon('info')}<span>These settings are shared by everyone using the app, so they are stored by the bridge script. <button class="linkbtn" data-action="bridge-help">Update the bridge</button> to change them.</span></p>`;
  const u = S.update;
  const upText = { idle: 'Not checked yet', checking: 'Checking…', none: `You have the latest version`, available: `Version ${u.version} found, downloading…`, downloading: `Downloading version ${u.version}… ${u.progress || 0}%`, ready: `Version ${u.version} is ready to install`, error: u.message || 'Couldn’t check for updates', unsupported: 'Automatic updates work in the installed Windows app', disabled: 'Updates aren’t set up for this copy' }[u.state] || '';
  const sc = S.scanner;
  return `<div class="settings">
  <nav class="set-nav" aria-label="Settings sections">${[['you', 'You'], ['display', 'Display'], ['checks', 'Checks'], ['rules', 'Breeding rules'], ['reminders', 'Reminders'], ['scanner', 'Chip scanner'], ['connection', 'Connection'], ['updates', 'Updates']].map(([k, l]) => `<a href="#set-${k}">${l}</a>`).join('')}</nav>
  <div class="set-body">
  <section class="set" id="set-you"><h2>You</h2>
    <div class="field"><label for="p-who">Your name</label><input class="inp" id="p-who" value="${esc(P.who)}" placeholder="For example Austin" autocomplete="name"><span class="hint">Shown in the change history and on AVS submissions you log. Each computer keeps its own name.</span></div>
  </section>

  <section class="set" id="set-display"><h2>Display</h2>
    <div class="field"><span class="flabel" id="lbl-size">Text size</span>${radios('p-size', TEXT_SIZES, P.textSize)}<span class="hint">Ctrl + and Ctrl − also change it. Ctrl 0 resets it.</span></div>
    <div class="field"><span class="flabel">Contrast</span>${radios('p-contrast', [['normal', 'Normal'], ['high', 'High contrast']], P.contrast)}<span class="hint">High contrast uses darker text and stronger outlines.</span></div>
    <div class="field"><span class="flabel">Colours</span>${radios('p-theme', [['system', 'Match Windows'], ['light', 'Light'], ['dark', 'Dark']], P.theme)}</div>
  </section>

  <section class="set" id="set-checks"><h2>Checks</h2>${lockNote}
    <p class="muted">Choose what the app flags under “Needs attention”. Shared with everyone using the app.</p>
    ${toggle('x-licence', 'Dog licence numbers', X.checks.licence, 'Flag active dogs with no licence number, or one expiring within 30 days', !can)}
    ${toggle('x-health', 'Annual health checks', X.checks.healthcheck, 'Flag breeding dogs whose last annual check is over 12 months old', !can)}
    ${toggle('x-steril', 'Sterilisation of retired dogs', X.checks.sterilise, 'Flag retired dogs with no sterilisation recorded', !can)}
    ${numField('x-soon', 'Warn this many days before something is due', X.dueSoonDays, 'Vaccinations and parasite treatments show as “coming up” from this point', 1, 90)}
    <div><button class="btn primary" data-action="save-shared" data-part="checks" ${can ? '' : 'disabled'}>Save checks</button></div>
  </section>

  <section class="set" id="set-rules"><h2>Breeding rules</h2>${lockNote}
    <p class="muted">Enter the limits from your AVS licence conditions. Leave a box empty for no limit. Dams who reach a limit show as “Not eligible”, and the app warns you when recording a mating or litter.</p>
    <div class="form-grid">
      ${numField('r-minage', 'First mating from (months old)', B.minAgeMonths, 'A dam younger than this isn’t eligible', 0, 60)}
      ${numField('r-12', 'Most litters in any 12 months', B.maxLittersPer12Months, 'Counts litters born in the last 365 days', 1, 6)}
      ${numField('r-gap', 'Rest between litters (months)', B.minMonthsBetweenLitters, 'Warns if she whelped more recently than this', 1, 24)}
      ${numField('r-max', 'Most litters in total', B.maxLitters, 'Across her whole life', 1, 20)}
      ${numField('r-csec', 'Most C-sections', B.maxCsections, 'From the Delivery Method of her litters', 0, 10)}
      ${numField('r-retire', 'Retirement age (years)', B.retireAgeYears, 'She isn’t eligible from this age', 1, 20)}
    </div>
    <div><button class="btn primary" data-action="save-shared" data-part="rules" ${can ? '' : 'disabled'}>Save breeding rules</button></div>
  </section>

  <section class="set" id="set-reminders"><h2>Reminders</h2>${lockNote}
    ${toggle('m-email', 'Daily email', Rm.enabled, 'An email each morning listing what is overdue or due in the next 7 days. Sent only when something is due, even when the app is closed.', !can)}
    <div class="form-grid">
      <div class="field"><label for="m-hour">Send at</label><select class="sel" id="m-hour" ${can ? '' : 'disabled'}>${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${+Rm.hour === h ? 'selected' : ''}>${pad(h)}:00</option>`).join('')}</select><span class="hint">Your sheet’s time zone. Google may send it up to an hour later.</span></div>
      <div class="field"><label for="m-extra">Also send to</label><input class="inp" id="m-extra" value="${esc(Rm.extra || '')}" placeholder="name@example.com" ${can ? '' : 'disabled'}><span class="hint">Up to 5 addresses, separated by commas. It always goes to the Google account that owns the bridge.</span></div>
    </div>
    <div class="row"><button class="btn primary" data-action="save-shared" data-part="reminders" ${can ? '' : 'disabled'}>Save reminders</button><button class="btn" data-action="digest-test" ${can ? '' : 'disabled'}>Send a test email now</button></div>
    ${S.reminders.installed ? '<p class="muted small">The daily email is scheduled.</p>' : ''}
    <hr>
    ${toggle('p-notify', 'Windows notification', P.notify, 'When you open the app each day, show a notification if anything is overdue or due today')}
  </section>

  <section class="set" id="set-scanner"><h2>Chip scanner</h2>
    <p class="muted">Scanners that type like a keyboard work anywhere in the app with no setup: scan a microchip and that dog opens, or the number fills the box you’re typing in.</p>
    <h3>Serial (COM port) scanner</h3>
    <p class="muted">For a reader that connects as a COM port, such as an ESP32 with a 134.2 kHz FDX-B module. The app reads the 15-digit number from each line it sends.</p>
    <div class="scan-status"><span class="dot ${sc.state === 'on' ? 'ok' : sc.state === 'error' ? 'crit' : ''}" aria-hidden="true"></span><span>${esc(sc.state === 'on' ? `Connected to ${sc.name || 'scanner'}` : sc.state === 'error' ? sc.msg || 'Not connected' : sc.state === 'connecting' ? 'Connecting…' : 'Not connected')}</span></div>
    <div class="form-grid">
      <div class="field"><label for="p-baud">Speed (baud)</label><select class="sel" id="p-baud">${BAUDS.map(b => `<option ${b === +P.scanner.baud ? 'selected' : ''}>${b}</option>`).join('')}</select><span class="hint">Match your scanner’s setting. ESP32 boards usually use 115200.</span></div>
    </div>
    <div class="row">${sc.state === 'on' ? '<button class="btn" data-action="serial-off">Disconnect</button>' : '<button class="btn primary" data-action="serial-on">Connect a serial scanner</button>'}</div>
    <p class="muted small" id="scan-last">${S.lastScan ? `Last scan: <span class="chip">${esc(S.lastScan)}</span>` : ''}</p>
  </section>

  <section class="set" id="set-connection"><h2>Connection</h2>
    <dl class="kv"><dt>Status</dt><dd>${esc(S.conn.state === 'live' ? `Connected · synced at ${clock(S.conn.at)}` : S.conn.state === 'setup' ? 'Not connected yet' : S.conn.msg || 'Connecting…')}</dd>
    <dt>Spreadsheet</dt><dd>${S.sheetUrl ? `<a href="${esc(S.sheetUrl)}" target="_blank" rel="noopener">${esc(S.sheetTitle || 'Open in Google Sheets')}</a>` : '—'}</dd>
    <dt>Bridge script</dt><dd>${S.bridgeVersion ? `Version ${S.bridgeVersion}${S.bridgeVersion < NEED_BRIDGE ? ' · <b>update available</b>' : ' · up to date'}` : '—'}</dd>
    <dt>Refresh</dt><dd>Every 2 minutes, after each save, and with Ctrl+R</dd></dl>
    ${connFields(P, 'conn-form')}
    <div class="row"><button class="btn" data-action="reload">${icon('sync')}Reload now</button><button class="btn" data-action="copy-script">${icon('copy')}Copy bridge script</button><button class="btn" data-action="bridge-help">How to update the bridge</button></div>
  </section>

  <section class="set" id="set-updates"><h2>Updates</h2>
    <dl class="kv"><dt>This version</dt><dd>${esc(S.version || '—')}</dd><dt>Status</dt><dd>${esc(upText)}</dd></dl>
    ${toggle('p-auto', 'Download updates automatically', P.autoUpdate, 'New versions download in the background. You choose when to restart.')}
    <div class="row"><button class="btn" data-action="update-check">${icon('sync')}Check for updates</button>${u.state === 'ready' ? '<button class="btn primary" data-action="update-install">Restart and update</button>' : ''}</div>
  </section>
  </div></div>`;
}
function afterSettings() {
  const on = (id, ev, fn) => { const el = $('#' + id); if (el) el.addEventListener(ev, fn); };
  on('p-who', 'change', e => setPrefs({ who: e.target.value.trim().slice(0, 60) }, 'Name saved'));
  $$('input[name="p-size"]').forEach(r => r.addEventListener('change', () => setPrefs({ textSize: +r.value })));
  $$('input[name="p-contrast"]').forEach(r => r.addEventListener('change', () => setPrefs({ contrast: r.value })));
  $$('input[name="p-theme"]').forEach(r => r.addEventListener('change', () => setPrefs({ theme: r.value })));
  on('p-notify', 'change', e => setPrefs({ notify: e.target.checked }, e.target.checked ? 'Notifications on' : 'Notifications off'));
  on('p-auto', 'change', e => setPrefs({ autoUpdate: e.target.checked }));
  on('p-baud', 'change', e => setPrefs({ scanner: Object.assign({}, S.prefs.scanner, { baud: +e.target.value }) }));
}
function sharedPatch(part) {
  const num = id => { const v = ($('#' + id) || {}).value; return v === '' || v == null ? null : Number(v); };
  const chk = id => !!($('#' + id) || {}).checked;
  if (part === 'checks') return { checks: { licence: chk('x-licence'), healthcheck: chk('x-health'), sterilise: chk('x-steril') }, dueSoonDays: num('x-soon') || 14 };
  if (part === 'rules') return { breeding: { minAgeMonths: num('r-minage'), maxLittersPer12Months: num('r-12'), minMonthsBetweenLitters: num('r-gap'), maxLitters: num('r-max'), maxCsections: num('r-csec'), retireAgeYears: num('r-retire') } };
  if (part === 'reminders') return { reminders: { enabled: chk('m-email'), hour: +($('#m-hour') || {}).value || 0, extra: ($('#m-extra') || {}).value || '' } };
  return {};
}
async function saveShared(part, btn) {
  const patch = sharedPatch(part);
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Saving…';
  const res = await deskCall({ action: 'settings_set', settings: patch });
  btn.disabled = false; btn.textContent = label;
  if (!res || !res.ok) { toast(deskText(res || {}), true); return; }
  S.shared = mergeShared(res.settings);
  if (res.reminders) S.reminders = res.reminders;
  rebuild();
  toast(part === 'rules' ? 'Breeding rules saved' : part === 'checks' ? 'Checks saved' : 'Reminders saved');
  if (res.reminders && res.reminders.error) toast(`The daily email couldn’t be scheduled: ${res.reminders.error}. Run setupAppBridge again in Apps Script to grant permission.`, true);
  renderNav(); renderView();
}
async function digestTest(btn) {
  btn.disabled = true;
  const res = await deskCall({ action: 'digest_test' });
  btn.disabled = false;
  if (!res || !res.ok) { toast(deskText(res || {}), true); return; }
  toast(`Test email sent to ${(res.to || []).join(', ')}`);
}
function mergeShared(x) {
  const out = clone(DEFAULT_SHARED);
  const m = (a, b) => { Object.keys(b || {}).forEach(k => { if (a[k] && typeof a[k] === 'object' && b[k] && typeof b[k] === 'object') m(a[k], b[k]); else if (k in a) a[k] = b[k]; }); };
  m(out, x || {});
  return out;
}
async function setPrefs(patch, msg) {
  S.prefs = Object.assign({}, S.prefs, patch);
  applyDisplay();
  try { await window.k9.setPrefs(patch); if (msg) toast(msg); }
  catch (e) { toast('Couldn’t save that setting on this computer.', true); }
}
function applyDisplay() {
  const root = document.documentElement;
  const P = S.prefs;
  if (P.theme === 'light' || P.theme === 'dark') root.setAttribute('data-theme', P.theme); else root.removeAttribute('data-theme');
  if (P.contrast === 'high') root.setAttribute('data-contrast', 'high'); else root.removeAttribute('data-contrast');
  try { window.k9.zoom(+P.textSize || 1); } catch (e) { /* older shell */ }
}
function stepTextSize(dir) {
  const sizes = TEXT_SIZES.map(x => x[0]);
  const i = sizes.indexOf(+S.prefs.textSize);
  const next = dir === 0 ? 1 : sizes[Math.max(0, Math.min(sizes.length - 1, (i < 0 ? 0 : i) + dir))];
  if (next !== +S.prefs.textSize) { setPrefs({ textSize: next }); toast(`Text size: ${TEXT_SIZES.find(x => x[0] === next)[1]}`); if (S.view === 'settings') renderView(); }
}
