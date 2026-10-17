'use strict';
/**
 * Runs the real app screens in Chromium with a stand-in for the Electron shell and the bridge,
 * then clicks through the main jobs and checks what would be sent to Google Sheets.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { readResponse, chip, ago, iso } = require('./fixture');

const R = path.join(__dirname, '..', 'renderer');
const TYPES = { html: 'text/html', css: 'text/css', js: 'application/javascript', woff2: 'font/woff2' };
let browser;
test.before(async () => { browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}); });
test.after(async () => { if (browser) await browser.close(); });

function stub(opts) {
  return `(() => {
    const O = ${JSON.stringify(opts)};
    const S = window.__k9 = { calls: [], prefs: O.prefs, zoom: [], pdfs: [], copies: [], updateCb: null, serialCb: null };
    const clone = x => JSON.parse(JSON.stringify(x));
    window.Notification = function (t, o) { (S.notes = S.notes || []).push(o && o.body); };
    window.k9 = {
      isDesktop: true,
      getPrefs: async () => clone(S.prefs),
      setPrefs: async p => { Object.assign(S.prefs, p); return { ok: true }; },
      test: async s => s.key === 'good-key' ? { ok: true, title: 'Test Kennel Records', version: O.read.version } : { ok: false, error: 'bad_key' },
      call: async p => {
        S.calls.push(clone(p));
        await new Promise(r => setTimeout(r, 15));
        if (p.action === 'read') return clone(S.read || O.read);
        if (p.action === 'batch') S.batchN = (S.batchN || 0) + 1;
        if (S.failAt && p.action === 'batch' && S.batchN === S.failAt.n) return Object.assign({ ok: false }, S.failAt.res);
        if (S.failNext && (p.action === 'save' || p.action === 'batch')) { const e = S.failNext; S.failNext = null; return typeof e === 'string' ? { ok: false, error: e } : Object.assign({ ok: false }, e); }
        if (p.action === 'save') return { ok: true, row: p.mode === 'new' ? 99 : p.row, id: p.tab === 'All Breeds' && p.mode === 'new' ? 'T099' : null };
        if (p.action === 'batch') { let n = 200, id = 22; return { ok: true, results: p.ops.map(op => ({ row: op.mode === 'new' ? n++ : op.row, id: op.tab === 'All Breeds' && op.mode === 'new' ? 'T0' + (id++) : null })) }; }
        if (p.action === 'settings_set') return { ok: true, settings: Object.assign({}, O.read.settings, p.settings), reminders: { installed: !!(p.settings.reminders && p.settings.reminders.enabled) } };
        if (p.action === 'digest_test') return { ok: true, to: ['owner@example.com'] };
        return { ok: false, error: 'bad_action' };
      },
      copy: async t => { S.copies.push(t); return true; },
      bridgeScript: async () => "const SPREADSHEET_ID = '__SHEET_ID__';",
      version: async () => '1.1.0',
      zoom: async f => { S.zoom.push(f); return f; },
      focus: async () => {},
      photo: async () => ({ ok: false }),
      pdf: async d => { S.pdfs.push(d); return { ok: true, name: d.filename }; },
      getUpdateState: async () => ({ state: 'idle' }),
      updateCheck: async () => true,
      updateInstall: async () => ({ ok: true }),
      onUpdate: cb => { S.updateCb = cb; },
      onSerialPorts: cb => { S.serialCb = cb; },
      serialChoose: async () => {},
    };
  })();`;
}
async function openApp(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(stub({ read: opts.read || readResponse({ version: opts.version || 2, settings: opts.settings }), prefs: Object.assign({ url: 'https://script.google.com/macros/s/TEST/exec', key: 'good-key', who: 'Sam Tester', notify: true }, opts.prefs || {}) }));
  await page.route('http://app.test/**', async route => {
    const f = path.join(R, new URL(route.request().url()).pathname.slice(1) || 'index.html');
    if (!fs.existsSync(f)) return route.fulfill({ status: 404 });
    await route.fulfill({ status: 200, contentType: TYPES[path.extname(f).slice(1)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await page.goto('http://app.test/index.html');
  if (!opts.setup) await page.waitForSelector('.quick', { timeout: 8000 });
  return { page, errors, ctx, calls: () => page.evaluate(() => window.__k9.calls), k9: () => page.evaluate(() => ({ prefs: window.__k9.prefs, zoom: window.__k9.zoom, pdfs: window.__k9.pdfs.map(p => ({ filename: p.filename, len: p.html.length, html: p.html })), copies: window.__k9.copies, notes: window.__k9.notes })) };
}

test('first run shows the setup steps and connects with the right key', async () => {
  const { page, errors, ctx, k9 } = await openApp({ setup: true, prefs: { url: '', key: '' } });
  await page.waitForSelector('#setup-form');
  assert.match(await page.textContent('#title'), /Set up/);
  await page.fill('#setup-sheet', 'https://docs.google.com/spreadsheets/d/ABCDEFGHIJKLMNOPQRSTUVWXYZ0123/edit');
  await page.click('[data-action="copy-script"]');
  const copied = (await k9()).copies[0];
  assert.match(copied, /ABCDEFGHIJKLMNOPQRSTUVWXYZ0123/, 'the sheet ID is filled into the copied script');
  await page.fill('#setup-form-url', 'https://script.google.com/macros/s/TEST/exec');
  await page.fill('#setup-form-key', 'wrong');
  await page.click('#setup-form button[type=submit]');
  await page.waitForFunction(() => /access key/.test(document.querySelector('#setup-form .set-msg').textContent));
  await page.fill('#setup-form-key', 'good-key');
  await page.click('#setup-form button[type=submit]');
  await page.waitForSelector('.quick');
  assert.equal((await k9()).prefs.key, 'good-key');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('home shows quick actions, counts, what needs attention and what is coming up', async () => {
  const { page, errors, ctx, k9 } = await openApp();
  assert.match(await page.textContent('.hello h2'), /Sam/);
  assert.equal(await page.locator('.qa-btn').count(), 4);
  assert.equal(await page.textContent('.kpi b >> nth=0'), '19');
  assert.match(await page.textContent('.kpi >> nth=0'), /of 22 on record/);
  const attn = await page.textContent('.attn');
  assert.match(attn, /Licence number missing/);
  assert.match(attn, /Vaccination due/);
  const due = await page.textContent('.list');
  assert.match(due, /Expected whelping/);
  assert.match(due, /days? late/);
  assert.equal((await k9()).notes.length, 1, 'one daily Windows notification');
  assert.equal(await page.locator('.banner.warn').count(), 0, 'no bridge banner on version 2');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('an older bridge shows the update notice and bulk logging explains why it is unavailable', async () => {
  const { page, errors, ctx } = await openApp({ version: 1 });
  await page.waitForSelector('.banner.warn');
  await page.click('.qa-btn[data-action="bulk"]');
  await page.waitForSelector('.mcard');
  assert.match(await page.textContent('.mcard h2'), /needs the bridge update/);
  await page.click('.mcard [data-action="bridge-help"]');
  await page.waitForSelector('.steps.compact');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('dogs list filters, opens a profile, and the kennel view moves a dog', async () => {
  const { page, errors, ctx, calls } = await openApp();
  await page.click('.nav button[data-view="dogs"]');
  await page.waitForSelector('#dog-table table');
  await page.fill('#dog-q', 'Mochi');
  assert.equal(await page.locator('#dog-table tbody tr').count(), 1);
  await page.click('#dog-table tbody tr');
  await page.waitForSelector('.drawer h2');
  assert.equal(await page.textContent('.drawer h2'), 'Mochi');
  assert.match(await page.textContent('.drawer'), /Vaccination overdue/);
  await page.keyboard.press('Escape');
  await page.click('[data-action="dogs-mode"][data-mode="kennels"]');
  await page.waitForSelector('.kennel');
  assert.ok(await page.locator('.kennel').count() >= 5);
  await page.click('.kennel:has(h3:text("Kennel 5")) [data-action="move-dog"]');
  await page.fill('#mv-dog', chip(0));
  await page.click('.mcard button[type=submit]');
  await page.waitForFunction(() => window.__k9.calls.some(c => c.action === 'save'));
  const save = (await calls()).find(c => c.action === 'save');
  assert.equal(save.tab, 'All Breeds');
  assert.equal(save.mode, 'edit');
  assert.deepEqual(save.changes, [{ h: 'Kennel No.', k: 0, v: '5', kind: 'text' }]);
  const ex = save.expect.map(e => e.h);
  assert.ok(ex.includes('Microchip No.') && ex.includes('Kennel No.') && ex.includes('Name'), 'the whole row is checked, not just the kennel');
  assert.ok(!ex.includes('Age'), 'calculated columns are not checked');
  assert.ok(save.opId && save.opHash, 'saves carry a retry-safe ID');
  assert.equal(save.who, 'Sam Tester');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('logging for many dogs sends one batch with a row per ticked dog', async () => {
  const { page, errors, ctx, calls } = await openApp();
  await page.click('.qa-btn[data-action="bulk"]');
  await page.waitForSelector('#bk-list .bk-dog');
  await page.selectOption('#bk-tab', 'Vaccinations');
  await page.selectOption('#bk-breed', 'MALTIPOO');
  await page.click('[data-bk="all"]');
  const n = await page.locator('#bk-list input:checked').count();
  assert.ok(n >= 4);
  const vaccineField = page.locator('#bk-fields label:text("Vaccine Type") + input');
  await vaccineField.fill('Rabies');
  await page.click('#bk-fields .shortcuts button:text("+1 year")');
  await page.click('#bk-save');
  assert.match(await page.textContent('#bk-msg'), /Press again to confirm/);
  await page.click('#bk-save');
  await page.waitForFunction(() => window.__k9.calls.some(c => c.action === 'batch'));
  const batch = (await calls()).find(c => c.action === 'batch');
  assert.equal(batch.ops.length, n);
  const op = batch.ops[0];
  assert.equal(op.tab, 'Vaccinations');
  assert.equal(op.mode, 'new');
  const h = Object.fromEntries(op.changes.map(c => [c.h, c]));
  assert.equal(h['Microchip No.'].kind, 'chip');
  assert.ok(h['Dog Name'].v, 'the dog name is filled in for each row');
  assert.equal(h['Vaccine Type'].v, 'Rabies');
  assert.equal(h['Date Given'].v, iso(Date.now()).slice(0, 10).length === 10 ? h['Date Given'].v : '');
  assert.match(h['Next Due Date'].v, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(new Set(batch.ops.map(o => o.changes.find(c => c.h === 'Microchip No.').v)).size === n, 'each op is a different dog');
  await page.waitForSelector('.toast');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('recording a litter adds the litter, each puppy and marks the mating successful', async () => {
  const { page, errors, ctx, calls } = await openApp();
  await page.click('.qa-btn[data-action="litter"]');
  await page.waitForSelector('#lt-dam');
  await page.fill('#lt-dam', chip(3));
  assert.equal(await page.inputValue('#lt-sire'), chip(2), 'the sire comes from her mating');
  assert.equal(await page.isVisible('#lt-mat-wrap'), true);
  assert.equal(await page.inputValue('#lt-breed'), '', 'parents of different breeds leave the breed for you to fill in');
  await page.fill('#lt-breed', 'MALTIPOM');
  await page.fill('#lt-n', '3');
  await page.selectOption('#pp-sex-0', 'M');
  await page.selectOption('#pp-sex-1', 'F');
  await page.click('#lt-save');
  assert.match(await page.textContent('#lt-msg'), /sex for puppy 3/);
  await page.selectOption('#pp-sex-2', 'F');
  await page.fill('#pp-col-0', 'APRICOT');
  await page.fill('#pp-chip-1', chip(0));
  await page.click('#lt-save');
  assert.match(await page.textContent('#lt-msg'), /already belongs/);
  await page.fill('#pp-chip-1', '999000000777777');
  await page.click('#lt-save');
  await page.waitForFunction(() => window.__k9.calls.some(c => c.action === 'batch'));
  const batch = (await calls()).find(c => c.action === 'batch');
  assert.deepEqual(batch.ops.map(o => `${o.tab}:${o.mode}`), ['Puppies Bred In-House:new', 'All Breeds:new', 'All Breeds:new', 'All Breeds:new', 'Mating Records:edit']);
  const lit = Object.fromEntries(batch.ops[0].changes.map(c => [c.h, c.v]));
  assert.equal(lit['No. of Puppies'], '3');
  assert.equal(lit['Sex Breakdown'], '1 M, 2 F');
  assert.equal(lit['Puppy Microchips'], '999000000777777');
  const pup = Object.fromEntries(batch.ops[1].changes.map(c => [c.h, c.v]));
  assert.equal(pup['Dam Microchip'], chip(3));
  assert.equal(pup['Sire Microchip'], chip(2));
  assert.equal(pup['Breed'], 'MALTIPOM');
  assert.equal(pup['Status'], 'Active');
  assert.equal(pup['Animal ID'], undefined, 'the bridge assigns IDs');
  const mx = Object.fromEntries(batch.ops[4].expect.map(e => [e.h, e.v]));
  assert.equal(mx['Successful'], '');
  assert.equal(mx['Dam Microchip'], chip(3), 'the mating row is identified by more than its blank Successful cell');
  assert.ok(mx['Date of Mating']);
  await page.waitForSelector('.toast');
  assert.match(await page.textContent('.toasts'), /T022 to T024/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('breeding rules mark a dam with a recent litter as not eligible', async () => {
  const { page, errors, ctx } = await openApp();
  await page.click('.nav button[data-view="breeding"]');
  await page.waitForSelector('table');
  const row = page.locator('tr:has-text("Biscuit")');
  assert.match(await row.textContent(), /Not eligible/);
  assert.match(await row.textContent(), /1 litter in the last 12 months/);
  assert.match(await page.textContent('.note'), /at most 1 litter in 12 months/);
  assert.match(await page.textContent('.expect'), /Toffee/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a single record form saves, and blocks when a required date is missing', async () => {
  const { page, errors, ctx, calls } = await openApp();
  await page.click('.nav button[data-view="dogs"]');
  await page.fill('#dog-q', 'Pepper');
  await page.click('#dog-table tbody tr');
  await page.click('.drawer [data-tab="Daily Health Monitoring"]');
  await page.waitForSelector('form.mcard');
  assert.match(await page.textContent('form.mcard'), /Numbered automatically/);
  const dateInput = page.locator('form.mcard label:text-is("Date *") + input, form.mcard label:has-text("Date") + input').first();
  await dateInput.fill('');
  await page.click('#form-save');
  assert.match(await page.textContent('#form-msg'), /Please fill in Date/);
  await dateInput.fill(iso(Date.now()));
  await page.click('#form-save');
  await page.waitForFunction(() => window.__k9.calls.some(c => c.action === 'save'));
  const save = (await calls()).find(c => c.action === 'save');
  assert.equal(save.tab, 'Daily Health Monitoring');
  assert.ok(!save.changes.some(c => c.h === 'S/N'), 'S/N is left to the bridge');
  assert.ok(save.changes.some(c => c.h === 'Microchip No.' && c.v === chip(2)));
  assert.match(save.dog, /Pepper/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('reports: monthly summary, PDF, mark as submitted, and change history', async () => {
  const { page, errors, ctx, k9 } = await openApp();
  await page.click('.nav button[data-view="reports"]');
  await page.waitForSelector('#rep-month');
  const thisMonth = new Date().toISOString().slice(0, 7);
  await page.selectOption('#rep-month', thisMonth).catch(() => {});
  await page.click('[data-action="pdf-month"]');
  await page.waitForFunction(() => window.__k9.pdfs.length === 1);
  const pdf = (await k9()).pdfs[0];
  assert.match(pdf.filename, /AVS monthly summary/);
  assert.match(pdf.html, /TEST KENNEL/);
  await page.click('[data-action="mark-submitted"]');
  await page.waitForSelector('form.mcard');
  const month = await page.locator('form.mcard input').first().inputValue();
  assert.match(month, /\w+ \d{4}/);
  await page.keyboard.press('Escape');
  await page.click('[data-action="guard-discard"]').catch(() => {});
  await page.click('[data-action="report-tab"][data-tab="changes"]');
  await page.waitForSelector('#chg-body');
  assert.match(await page.textContent('#chg-body'), /Sam Tester/);
  await page.click('[data-action="report-tab"][data-tab="herd"]');
  await page.waitForSelector('.bars');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('settings: text size, contrast, breeding rules and reminders', async () => {
  const { page, errors, ctx, k9, calls } = await openApp();
  await page.click('.nav button[data-view="settings"]');
  await page.waitForSelector('#set-display');
  await page.check('input[name="p-size"][value="1.15"]');
  await page.check('input[name="p-contrast"][value="high"]');
  const st = await k9();
  assert.equal(st.prefs.textSize, 1.15);
  assert.ok(st.zoom.includes(1.15));
  assert.equal(await page.getAttribute('html', 'data-contrast'), 'high');
  await page.fill('#r-12', '2');
  await page.fill('#r-retire', '6');
  await page.click('[data-action="save-shared"][data-part="rules"]');
  await page.waitForFunction(() => window.__k9.calls.some(c => c.action === 'settings_set'));
  const set = (await calls()).find(c => c.action === 'settings_set');
  assert.equal(set.settings.breeding.maxLittersPer12Months, 2);
  assert.equal(set.settings.breeding.retireAgeYears, 6);
  assert.equal(set.settings.breeding.maxLitters, null);
  await page.keyboard.press('Control+-');
  assert.equal((await k9()).prefs.textSize, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a keyboard-style scanner opens the scanned dog, and fills a microchip box when one is focused', async () => {
  const { page, errors, ctx } = await openApp();
  await page.keyboard.type(chip(5), { delay: 5 });
  await page.keyboard.press('Enter');
  await page.waitForSelector('.drawer h2');
  assert.equal(await page.textContent('.drawer h2'), 'Kiwi');
  await page.keyboard.press('Escape');
  await page.click('.qa-btn[data-action="litter"]');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'lt-dam');
  await page.evaluate(c => { const el = document.activeElement; el.value = c; el.dispatchEvent(new Event('input', { bubbles: true })); }, chip(4));
  await page.waitForFunction(() => /Luna/.test(document.querySelector('#lt-dam-h').textContent));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('dialogs keep keyboard focus inside and close with Escape', async () => {
  const { page, errors, ctx } = await openApp();
  await page.click('.qa-btn[data-action="add-dog"]');
  await page.waitForSelector('form.mcard');
  for (let i = 0; i < 60; i++) await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement.closest('.ov')), true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.ov'));
  assert.equal(await page.getAttribute('#shell', 'aria-hidden'), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a downloaded update shows a restart notice', async () => {
  const { page, errors, ctx } = await openApp();
  await page.evaluate(() => window.__k9.updateCb({ state: 'ready', version: '9.9.9' }));
  await page.waitForSelector('.banner.acc');
  assert.match(await page.textContent('.banner.acc'), /9\.9\.9/);
  await page.click('[data-action="update-later"]');
  assert.equal(await page.locator('.banner.acc').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the narrowest window has no sideways scrolling', async () => {
  const { page, errors, ctx } = await openApp({ viewport: { width: 900, height: 700 } });
  for (const v of ['home', 'dogs', 'breeding', 'records', 'reports', 'settings']) {
    await page.evaluate(view => { document.querySelector(`.nav button[data-view="${view}"]`).click(); }, v);
    await page.waitForTimeout(80);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(over <= 0, `${v} overflows by ${over}px`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('editing a dog with no status leaves the status blank', async () => {
  const { page, errors, ctx, calls } = await openApp();
  await page.click('.nav button[data-view="dogs"]');
  await page.click('[data-action="dogs-status"][data-status="all"]');
  await page.fill('#dog-q', 'Olive');
  await page.click('#dog-table tbody tr');
  await page.click('.drawer [data-action="edit-dog"]');
  await page.waitForSelector('form.mcard');
  assert.equal(await page.inputValue('form.mcard select[data-kind="status"]'), '');
  await page.fill('form.mcard textarea', 'Updated remark');
  await page.click('#form-save');
  await page.waitForFunction(() => window.__k9.calls.some(c => c.action === 'save'));
  const save = (await calls()).find(c => c.action === 'save');
  assert.deepEqual(save.changes.map(c => c.h), ['Remarks']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a save Google didn’t confirm can be pressed again without saving twice', async () => {
  const { page, errors, ctx, calls } = await openApp();
  await page.click('.qa-btn[data-action="bulk"]');
  await page.waitForSelector('#bk-list .bk-dog');
  await page.selectOption('#bk-breed', 'MALTESE');
  await page.click('[data-bk="all"]');
  await page.click('#bk-save');
  await page.evaluate(() => { window.__k9.failNext = 'timeout'; });
  await page.click('#bk-save');
  await page.waitForFunction(() => /won’t be saved twice/.test(document.querySelector('#bk-msg').textContent));
  assert.equal(await page.textContent('#bk-save'), 'Save again');
  await page.click('#bk-save');
  await page.waitForFunction(() => window.__k9.calls.filter(c => c.action === 'batch').length === 2);
  const [first, second] = (await calls()).filter(c => c.action === 'batch');
  assert.equal(first.opId, second.opId);
  assert.equal(first.opHash, second.opHash);
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** The test kennel plus extra active dogs that have no kennel yet. */
function bigHerd(extra) {
  const res = readResponse({ version: 3 });
  const t = res.tabs['All Breeds'];
  for (let i = 0; i < extra; i++) {
    const r = t.lastRow + 1;
    t.rows.push({ r, v: [`X${String(i + 1).padStart(3, '0')}`, '999000000' + String(500000 + i), `Extra ${i + 1}`, 'MALTESE', 'WHITE', 'F', ago(800), '2y', '', 'Test Kennel - Breeding', '', 'Active', '', '', '', 'Local breeder', '', '', '', ''] });
    t.lastRow = r;
  }
  return res;
}

test('quick fill: licence numbers typed down the list save as one checked batch', async () => {
  const { page, errors, ctx, calls } = await openApp({ version: 3 });
  await page.click('.attn button[data-issue="licence"]');
  await page.waitForSelector('#dog-table table');
  await page.click('[data-action="quick-fill"][data-issue="licence"]');
  await page.waitForSelector('.qf-table');
  assert.equal(await page.inputValue('#qf-what'), 'licence');
  assert.equal(await page.inputValue('#qf-which'), 'todo');
  assert.equal(await page.locator('.qf-table tbody tr').count(), 10, 'the active dogs with no licence number');
  await page.waitForFunction(() => document.activeElement && document.activeElement.id === 'qf-0-0');
  await page.keyboard.type('LIC-2000');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'qf-1-0', 'Enter goes to the next dog');
  await page.keyboard.type('LIC-1001'); // already Mochi's
  await page.fill('#qf-0-1', '2027-05-01');
  assert.match(await page.textContent('#qf-count'), /2 dogs changed/);
  await page.click('#qf-save');
  assert.match(await page.textContent('#qf-msg'), /LIC-1001 is on .*Mochi.*Each dog needs its own/);
  assert.equal(await page.getAttribute('#qf-1-0', 'aria-invalid'), 'true');
  assert.equal((await calls()).filter(c => c.action === 'batch').length, 0, 'nothing is sent while a number is repeated');
  await page.fill('#qf-1-0', 'LIC-2001');
  await page.click('#qf-save');
  await page.waitForFunction(() => window.__k9.calls.some(c => c.action === 'batch'));
  const batch = (await calls()).find(c => c.action === 'batch');
  assert.equal(batch.ops.length, 2);
  const [a, b] = batch.ops;
  assert.equal(a.tab, 'All Breeds');
  assert.equal(a.mode, 'edit');
  assert.match(a.dog, /Biscuit/);
  assert.ok(a.row < b.row, 'in sheet order');
  assert.deepEqual(a.changes.map(c => [c.h, c.v, c.kind]), [['PALS Licence No.', 'LIC-2000', 'text'], ['Licence Expiry', '2027-05-01', 'date']]);
  assert.deepEqual(b.changes.map(c => c.h), ['PALS Licence No.']);
  assert.deepEqual(a.expect.map(e => e.h).sort(), ['Animal ID', 'Licence Expiry', 'Microchip No.', 'Name', 'PALS Licence No.']);
  assert.equal(a.expect.find(e => e.h === 'Animal ID').v, 'T001');
  assert.equal(a.expect.find(e => e.h === 'PALS Licence No.').v, '');
  await page.waitForSelector('.toast');
  assert.match(await page.textContent('.toasts'), /Saved 2 dogs/);
  await page.waitForFunction(() => !document.querySelector('.qf-table'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('quick fill offers the sheet’s dropdown choices and fills only the blank boxes', async () => {
  const { page, errors, ctx, calls } = await openApp({ version: 3 });
  assert.equal(await page.locator('.banner.soft').count(), 0, 'no bridge notice on the newest bridge');
  await page.click('.nav button[data-view="dogs"]');
  await page.click('#top-act [data-action="quick-fill"]');
  await page.waitForSelector('.qf-table');
  await page.selectOption('#qf-what', 'sterilised');
  assert.equal(await page.locator('.qf-table tbody tr').count(), 1, 'one retired dog is flagged');
  await page.selectOption('#qf-which', 'retired');
  assert.equal(await page.locator('.qf-table tbody tr').count(), 2);
  const opts = await page.$$eval('#qf-0-0 option', os => os.map(o => o.value));
  assert.deepEqual(opts, ['', 'Yes', 'Y', 'N', 'Pending', 'Exempted'], 'the sheet’s choices, plus the value already there');
  await page.selectOption('#qf-fill-0', 'Y');
  await page.click('[data-qf-fill="0"]');
  assert.match(await page.textContent('#qf-msg'), /Filled 1 blank box/);
  assert.equal(await page.inputValue('#qf-0-0'), 'Yes', 'a box that already had a value is left alone');
  assert.equal(await page.inputValue('#qf-1-0'), 'Y');
  await page.click('#qf-save');
  await page.waitForFunction(() => window.__k9.calls.some(c => c.action === 'batch'));
  const batch = (await calls()).find(c => c.action === 'batch');
  assert.equal(batch.ops.length, 1);
  assert.match(batch.ops[0].dog, /Juniper/);
  assert.deepEqual(batch.ops[0].changes, [{ h: 'Sterilised', k: 0, v: 'Y', kind: 'text' }]);
  await page.waitForSelector('.toast');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('quick fill saves a long list in groups, and a group Google didn’t confirm can be sent again safely', async () => {
  const { page, errors, ctx, calls } = await openApp({ read: bigHerd(70) });
  await page.evaluate(() => { window.__k9.failAt = { n: 2, res: { error: 'timeout' } }; });
  await page.click('.nav button[data-view="dogs"]');
  await page.click('[data-action="dogs-mode"][data-mode="kennels"]');
  await page.click('[data-action="quick-fill"][data-preset="kennel"]');
  await page.waitForSelector('.qf-table');
  assert.equal(await page.inputValue('#qf-which'), 'blank-active');
  assert.equal(await page.locator('.qf-table tbody tr').count(), 71, 'the new dogs and the unnamed puppy have no kennel');
  await page.selectOption('#qf-fill-0', '3');
  await page.click('[data-qf-fill="0"]');
  await page.click('#qf-save');
  await page.waitForFunction(() => /won’t be saved twice/.test(document.querySelector('#qf-msg').textContent));
  assert.match(await page.textContent('#qf-msg'), /Saved 40 of 71 dogs/);
  assert.equal(await page.textContent('#qf-save'), 'Save again');
  assert.match(await page.textContent('#qf-count'), /31 dogs changed/);
  await page.click('#qf-save');
  await page.waitForSelector('.toast');
  assert.match(await page.textContent('.toasts'), /Saved 71 dogs/);
  const batches = (await calls()).filter(c => c.action === 'batch');
  assert.deepEqual(batches.map(b => b.ops.length), [40, 31, 31]);
  assert.equal(batches[1].opId, batches[2].opId, 'the unconfirmed group is resent with the same ID');
  assert.equal(batches[1].opHash, batches[2].opHash);
  assert.notEqual(batches[0].opId, batches[1].opId);
  assert.ok(!batches[2].ops.some(op => batches[0].ops.some(x => x.row === op.row)), 'the first group isn’t sent again');
  assert.ok(batches.every(b => b.ops.every(op => op.changes.length === 1 && op.changes[0].v === '3')));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('quick fill: when a dog changed in the sheet meanwhile, it reloads and keeps the rest of what you typed', async () => {
  const { page, errors, ctx, calls } = await openApp({ version: 3 });
  await page.click('.nav button[data-view="dogs"]');
  await page.click('#top-act [data-action="quick-fill"]');
  await page.waitForSelector('.qf-table');
  await page.fill('#qf-0-0', 'LIC-3000'); // Biscuit
  await page.fill('#qf-1-0', 'LIC-3001'); // Pepper
  const changed = readResponse({ version: 3 });
  changed.tabs['All Breeds'].rows[0].v[18] = 'LIC-OTHER'; // someone filled in Biscuit’s licence meanwhile
  await page.evaluate(r => { window.__k9.read = r; window.__k9.failNext = { error: 'row_changed', index: 0 }; }, changed);
  await page.click('#qf-save');
  await page.waitForFunction(() => /press Save again/.test(document.querySelector('#qf-msg').textContent));
  const msg = await page.textContent('#qf-msg');
  assert.match(msg, /Biscuit \(T001\) was changed in the sheet/);
  assert.match(msg, /1 box that changed in the sheet was put back to the sheet’s value/);
  assert.equal(await page.inputValue('#qf-0-0'), 'LIC-3001', 'what you typed for other dogs is kept');
  assert.match(await page.textContent('#qf-count'), /1 dog changed/);
  await page.click('#qf-save');
  await page.waitForFunction(() => window.__k9.calls.filter(c => c.action === 'batch').length === 2);
  const second = (await calls()).filter(c => c.action === 'batch')[1];
  assert.equal(second.ops.length, 1);
  assert.match(second.ops[0].dog, /Pepper/);
  await page.waitForSelector('.toast');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Adopted is a status with its own filter, and forms use the sheet’s dropdown lists', async () => {
  const read = readResponse({ version: 3 });
  const rows = read.tabs['All Breeds'].rows;
  rows.find(r => r.v[2] === 'Olive').v[11] = 'Adopted';
  rows.find(r => r.v[2] === 'Juniper').v[8] = 'Exempted';
  const { page, errors, ctx } = await openApp({ read });
  await page.click('.nav button[data-view="dogs"]');
  await page.click('[data-action="dogs-status"][data-status="adopted"]');
  assert.equal(await page.locator('#dog-table tbody tr').count(), 1);
  assert.match(await page.textContent('#dog-table tbody tr'), /Olive/);
  assert.equal(await page.locator('#dog-table .pill.ok', { hasText: 'Adopted' }).count(), 1);
  await page.click('[data-action="dogs-status"][data-status="retired"]');
  const jun = page.locator('#dog-table tbody tr', { hasText: 'Juniper' });
  assert.doesNotMatch(await jun.textContent(), /Sterilise/, 'a dog exempted from sterilisation isn’t flagged');
  await jun.click();
  await page.click('.drawer [data-action="edit-dog"]');
  await page.waitForSelector('form.mcard');
  const status = await page.$$eval('form.mcard select[data-kind="status"] option', os => os.map(o => o.value));
  assert.deepEqual(status, ['', 'Retired', 'Active', 'Deceased', 'Sold', 'Adopted']);
  const steril = await page.$$eval('form.mcard .field', fs => { const f = fs.find(x => /^Sterilised/.test(x.textContent)); return Array.from(f.querySelectorAll('option')).map(o => o.value); });
  assert.deepEqual(steril, ['', 'Exempted', 'Y', 'N', 'Pending']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('an older bridge still works and suggests the update without getting in the way', async () => {
  const { page, errors, ctx } = await openApp();
  await page.waitForSelector('.banner.soft');
  await page.click('.nav button[data-view="dogs"]');
  await page.click('#top-act [data-action="quick-fill"]');
  await page.waitForSelector('.qf-table');
  assert.match(await page.textContent('.mcard .note'), /dropdown lists/);
  await page.selectOption('#qf-what', 'status');
  const opts = await page.$$eval('#qf-0-0 option', os => os.map(o => o.value));
  assert.ok(opts.includes('Adopted'), 'the app’s own list includes Adopted');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.ov'));
  await page.click('[data-action="bridge-later"]');
  assert.equal(await page.locator('.banner.soft').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('quick fill never moves what you typed onto another dog when microchips are swapped in the sheet meanwhile', async () => {
  const { page, errors, ctx, calls } = await openApp({ version: 3 });
  await page.click('.nav button[data-view="dogs"]');
  await page.click('#top-act [data-action="quick-fill"]');
  await page.waitForSelector('.qf-table');
  await page.fill('#qf-1-0', 'LIC-FOR-PEPPER'); // Pepper (T003)
  const changed = readResponse({ version: 3 });
  const rows = changed.tabs['All Breeds'].rows;
  rows[0].v[1] = chip(2); rows[2].v[1] = chip(0); // someone swaps Biscuit’s and Pepper’s microchips
  await page.evaluate(r => { window.__k9.read = r; window.__k9.failNext = { error: 'row_changed', index: 0 }; }, changed);
  await page.click('#qf-save');
  await page.waitForFunction(() => /press Save again/.test(document.querySelector('#qf-msg').textContent));
  assert.equal(await page.textContent('#qf-count'), '', 'the typed licence is dropped, because the app can’t be sure which dog it was for');
  assert.ok(!(await page.$$eval('.qf-table input', els => els.map(e => e.value))).includes('LIC-FOR-PEPPER'));
  await page.click('#qf-save');
  assert.match(await page.textContent('#qf-msg'), /Nothing has changed yet/);
  assert.equal((await calls()).filter(c => c.action === 'batch').length, 1, 'nothing more is sent');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('quick fill still catches a repeated microchip after part of a long list was saved', async () => {
  const { page, errors, ctx, calls } = await openApp({ read: bigHerd(45) });
  await page.evaluate(() => { window.__k9.failAt = { n: 2, res: { error: 'timeout' } }; });
  await page.click('.nav button[data-view="dogs"]');
  await page.click('#top-act [data-action="quick-fill"]');
  await page.waitForSelector('.qf-table');
  await page.selectOption('#qf-what', 'chip');
  await page.selectOption('#qf-which', 'all');
  await page.evaluate(() => { for (let i = 0; i < 41; i++) { const el = document.getElementById(`qf-${i}-0`); el.value = '999111000' + String(200000 + i); el.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.click('#qf-save');
  await page.waitForFunction(() => /won’t be saved twice/.test(document.querySelector('#qf-msg').textContent));
  assert.match(await page.textContent('#qf-count'), /^1 dog changed/);
  assert.equal(await page.inputValue('#qf-0-0'), '999111000200000', 'the saved chip shows in the list');
  const other = await page.inputValue('#qf-50-0');
  await page.fill('#qf-0-0', other); // a dog saved in the first group gets another dog’s chip
  await page.click('#qf-save');
  assert.match(await page.textContent('#qf-msg'), /is on .*Each dog needs its own/);
  assert.equal((await calls()).filter(c => c.action === 'batch').length, 2, 'nothing more is sent');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('quick fill sends dogs swapping microchips together in the first group', async () => {
  const { page, errors, ctx, calls } = await openApp({ read: bigHerd(45) });
  await page.click('.nav button[data-view="dogs"]');
  await page.click('#top-act [data-action="quick-fill"]');
  await page.waitForSelector('.qf-table');
  await page.selectOption('#qf-what', 'chip');
  await page.selectOption('#qf-which', 'all');
  const a = await page.inputValue('#qf-0-0'), b = await page.inputValue('#qf-60-0');
  await page.fill('#qf-0-0', b);
  await page.fill('#qf-60-0', a);
  await page.evaluate(() => { for (let i = 1; i <= 41; i++) { const el = document.getElementById(`qf-${i}-0`); el.value = '999222000' + String(300000 + i); el.dispatchEvent(new Event('input', { bubbles: true })); } });
  await page.click('#qf-save');
  await page.waitForSelector('.toast');
  const batches = (await calls()).filter(c => c.action === 'batch');
  assert.deepEqual(batches.map(x => x.ops.length), [2, 40, 1]);
  assert.deepEqual(batches[0].ops.map(op => op.changes[0].v).sort(), [a, b].sort(), 'the swap is saved all at once');
  assert.match(await page.textContent('.toasts'), /Saved 43 dogs/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('quick fill keeps line breaks in remarks and keeps focus on Fill blanks', async () => {
  const read = readResponse({ version: 3 });
  read.tabs['All Breeds'].rows[0].v[12] = 'Line one\nLine two';
  const { page, errors, ctx, calls } = await openApp({ read });
  await page.click('.nav button[data-view="dogs"]');
  await page.click('#top-act [data-action="quick-fill"]');
  await page.waitForSelector('.qf-table');
  await page.selectOption('#qf-what', 'col:Remarks');
  await page.selectOption('#qf-which', 'all');
  assert.equal(await page.inputValue('#qf-0-0'), 'Line one\nLine two');
  await page.focus('#qf-0-0');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('x');
  await page.keyboard.press('Backspace');
  assert.equal(await page.textContent('#qf-count'), '', 'typing and undoing changes nothing');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Line three');
  await page.fill('#qf-fill-0', 'Checked');
  await page.click('[data-qf-fill="0"]');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.qfFill), '0', 'focus stays on the button');
  await page.click('#qf-save');
  await page.waitForFunction(() => window.__k9.calls.some(c => c.action === 'batch'));
  const ops = (await calls()).find(c => c.action === 'batch').ops;
  assert.equal(ops[0].changes[0].v, 'Line one\nLine two\nLine three');
  assert.ok(ops.slice(1).every(op => op.changes[0].v === 'Checked'));
  assert.deepEqual(errors, []);
  await ctx.close();
});
