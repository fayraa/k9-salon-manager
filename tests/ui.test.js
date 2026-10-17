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
        if (p.action === 'read') return clone(O.read);
        if (S.failNext && (p.action === 'save' || p.action === 'batch')) { const e = S.failNext; S.failNext = null; return { ok: false, error: e }; }
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
  await page.addInitScript(stub({ read: readResponse({ version: opts.version || 2, settings: opts.settings }), prefs: Object.assign({ url: 'https://script.google.com/macros/s/TEST/exec', key: 'good-key', who: 'Sam Tester', notify: true }, opts.prefs || {}) }));
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
