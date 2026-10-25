'use strict';
/**
 * The phone version (web/): the real page, the real phone shell and the real bridge script, with Google's
 * web app stood in for by the Apps Script mock behind a pretend script.google.com. Runs at phone size.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const jsQR = require('jsqr');
const { readResponse, chip } = require('./fixture');
const { Sheet_, Spreadsheet_, loadBridge, Utilities } = require('./gas-mock');

const WEB = path.join(__dirname, '..', 'web');
const KEY = 'k'.repeat(40);
const BRIDGE = 'https://script.google.com/macros/s/AKfycbTEST0123456789/exec';
const BRIDGE_B = 'https://script.google.com/macros/s/AKfycbOTHERSHEETbbbbbb/exec';
const code = (url, key) => { const m = url.match(/\/s\/([\w-]+)\/exec$/); return `K9SALON:1:s=${m[1]}&k=${key}`; };
const TYPES = { html: 'text/html', css: 'text/css', js: 'application/javascript', woff2: 'font/woff2', png: 'image/png', webmanifest: 'application/manifest+json', gs: 'text/plain', txt: 'text/plain' };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

let browser, server, google, ORIGIN, TMP;
const G = { bridges: {}, calls: [], replies: new Map(), mode: 'ok', slowRead: {}, siteDown: false };
/** Starts Chromium with script.google.com and script.googleusercontent.com pointed at the stand-in for Google. */
function launch(extraArgs = []) {
  const port = google.address().port;
  const rules = ['script.google.com', 'script.googleusercontent.com'].map(h => `MAP ${h} 127.0.0.1:${port}`).join(',');
  return chromium.launch(Object.assign({ args: [`--host-resolver-rules=${rules}`, '--proxy-server=direct://', '--proxy-bypass-list=*', ...extraArgs] }, process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}));
}
test.before(async () => {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'k9-web-'));
  // Google's web app, as the phone sees it: a POST is answered with a redirect to script.googleusercontent.com, which serves the reply
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(TMP, 'key.pem'), '-out', path.join(TMP, 'cert.pem'), '-days', '2', '-subj', '/CN=script.google.com', '-addext', 'subjectAltName=DNS:script.google.com,DNS:script.googleusercontent.com'], { stdio: 'ignore' });
  google = https.createServer({ key: fs.readFileSync(path.join(TMP, 'key.pem')), cert: fs.readFileSync(path.join(TMP, 'cert.pem')) }, (req, res) => {
    const host = req.headers.host.split(':')[0];
    const u = new URL(req.url, `https://${host}`);
    if (host === 'script.googleusercontent.com' && req.method === 'GET') {
      const id = u.searchParams.get('user_content_key');
      if (!G.replies.has(id)) { res.writeHead(404); res.end('gone'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(G.replies.get(id));
      return;
    }
    if (req.method === 'OPTIONS') { G.calls.push({ preflight: true }); res.writeHead(405); res.end(); return; }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const at = `https://${host}${u.pathname}`, bridge = G.bridges[at];
      if (!bridge || req.method !== 'POST') { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<html>Sorry, unable to open the file at this time.</html>'); return; }
      if (G.mode === 'signin') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>Sign in to continue to Google Apps Script</html>'); return; } // "Who has access" isn't set to Anyone
      let payload = null;
      try { payload = JSON.parse(body); } catch (e) { /* left as null */ }
      G.calls.push({ at, payload, contentType: req.headers['content-type'], cookie: req.headers.cookie || '', origin: req.headers.origin || '' });
      const reply = () => {
        const out = bridge.ctx.doPost({ postData: { contents: body } }).getContent();
        const id = `r${G.replies.size + 1}`;
        G.replies.set(id, out);
        res.writeHead(302, { Location: `https://script.googleusercontent.com/macros/echo?user_content_key=${id}&lib=TEST`, 'Access-Control-Allow-Origin': '*' });
        res.end();
      };
      const slow = payload && payload.action === 'read' ? G.slowRead[at] || 0 : 0;
      if (slow) setTimeout(reply, slow); else reply();
    });
  });
  await new Promise(r => google.listen(0, '127.0.0.1', r));
  browser = await launch();
  // the published folder, served as GitHub Pages would serve it
  server = http.createServer((req, res) => {
    if (G.siteDown) { req.socket.destroy(); return; } // no connection at all
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (!p.startsWith('/k9/')) { res.writeHead(404); res.end(); return; }
    p = p.slice(4) || 'index.html';
    const f = path.join(WEB, p);
    if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).slice(1)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    res.end(fs.readFileSync(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  ORIGIN = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (browser) await browser.close();
  if (server) server.close();
  if (google) google.close();
  if (TMP) fs.rmSync(TMP, { recursive: true, force: true });
});

/** A spreadsheet with the same made-up kennel as the desktop tests, as Sheets would hold it. */
function sheetFromFixture() {
  const res = readResponse({ version: 2 });
  const tz = 'Asia/Kuala_Lumpur';
  const sheets = Object.entries(res.tabs).filter(([n]) => n !== 'App Change Log').map(([name, t]) => {
    const rows = [t.headers, ...t.rows.map(r => r.v.map(v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? Utilities.parseDate(v, tz, 'yyyy-MM-dd') : v)))];
    const formulas = {}, formats = {};
    if (name === 'All Breeds') t.rows.forEach(r => { formulas[`${r.r},8`] = '=IF(R[0]C[-1]="","",DATEDIF(R[0]C[-1],TODAY(),"Y"))'; formats[`${r.r},2`] = '@'; });
    return new Sheet_(name, rows, { formulas, formats });
  });
  return new Spreadsheet_(sheets, tz);
}
async function openPhone(opts = {}) {
  const ss = opts.ss || sheetFromFixture();
  const bridge = opts.bridge || loadBridge(ss);
  G.bridges = Object.assign({ [BRIDGE]: bridge }, opts.bridges || {}); G.calls = []; G.mode = 'ok'; G.slowRead = opts.slowRead || {}; G.siteDown = false;
  const calls = G.calls;
  const ctx = await (opts.browser || browser).newContext(Object.assign({}, PHONE, { serviceWorkers: opts.sw || 'block', ignoreHTTPSErrors: true }, opts.context || {}));
  if (opts.prefs !== null) {
    const prefs = opts.prefs || { url: BRIDGE, key: KEY, who: 'Sam Tester' };
    await ctx.addInitScript(p => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('k9.prefs', JSON.stringify(p)); sessionStorage.setItem('seeded', '1'); } }, prefs);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${ORIGIN}/k9/${opts.hash || ''}`);
  if (opts.wait !== false) await page.waitForSelector(opts.wait || '.quick', { timeout: 15000 });
  return { page, ctx, errors, calls, ss, bridge };
}
const noSideScroll = page => page.evaluate(() => {
  const wide = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.width && r.right > innerWidth + 1 && !el.closest('.table-wrap,.seg,.set-nav,.tabs,.ov .pup-table,.qf-wrap,.scan-view'); });
  return { page: document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#main').scrollWidth <= document.querySelector('#main').clientWidth + 1, wide: wide.slice(0, 5).map(el => `${el.tagName}.${el.className}`) };
});

/* helpers for files */
const qrSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '66-qr.js'), 'utf8');
const { qrMatrix } = new Function('esc', `${qrSrc}; return { qrMatrix };`)(s => String(s));
/** Checks a PDF's structure (every object where the index says), and returns its page count and drawn text. */
function readPdf(buf) {
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4\n'), 'a PDF header');
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  const at = +s.slice(s.lastIndexOf('startxref') + 9).trim().split(/\s+/)[0];
  assert.equal(s.slice(at, at + 5), 'xref\n', 'startxref points at the index');
  const n = +s.slice(at).match(/^xref\n0 (\d+)\n/)[1];
  s.slice(at).split('\n').slice(3, 2 + n).forEach((line, i) => {
    assert.equal(line.length, 19, 'index lines are 20 bytes');
    const off = +line.slice(0, 10);
    assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`, `object ${i + 1} is where the index says`);
  });
  let text = '';
  const re = /\d+ 0 obj\n<<([^]*?) \/Length (\d+)>>\nstream\n/g;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[0].length, len = +m[2];
    assert.equal(s.slice(start + len, start + len + 10), '\nendstream', 'stream lengths are right');
    if (/\/Subtype \/Image/.test(m[1])) continue;
    const raw = buf.subarray(start, start + len);
    text += (/FlateDecode/.test(m[1]) ? zlib.inflateSync(raw) : raw).toString('latin1');
  }
  const qpdf = (() => { try { execFileSync('qpdf', ['--version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
  if (qpdf) { const f = path.join(TMP, `check-${Date.now()}.pdf`); fs.writeFileSync(f, buf); execFileSync('qpdf', ['--check', f], { stdio: 'ignore' }); }
  return { pages: (s.match(/\/Type \/Page\b(?!s)/g) || []).length, text };
}
/** Clicks Save in the "ready" sheet and returns the file. */
async function saveOffered(page) {
  await page.waitForSelector('.mcard a[download]', { timeout: 30000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.mcard a[download]')]);
  const f = path.join(TMP, `dl-${Date.now()}`);
  await dl.saveAs(f);
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(f) };
}
/** A photo of a page, as a phone camera would hand it over. */
async function photo(page, label) {
  const b64 = await page.evaluate(l => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 1200;
    const g = c.getContext('2d'); g.fillStyle = '#f7f5ee'; g.fillRect(0, 0, 900, 1200); g.fillStyle = '#223'; g.font = 'bold 64px sans-serif'; g.fillText(l, 80, 160);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  }, label);
  return { name: `${label}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') };
}
/** A browser whose camera sees a QR code on a screen. */
function cameraSeeing(text) {
  const m = qrMatrix(text);
  const W = 640, H = 480, mod = 7, n = m.length + 8, size = n * mod, ox = (W - size) >> 1, oy = (H - size) >> 1;
  const Y = Buffer.alloc(W * H, 200);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) Y[(oy + y) * W + ox + x] = 250;
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) for (let dy = 0; dy < mod; dy++) for (let dx = 0; dx < mod; dx++) Y[(oy + (y + 4) * mod + dy) * W + ox + (x + 4) * mod + dx] = 20; }));
  const UV = Buffer.alloc(W * H / 4, 128);
  const file = path.join(TMP, `camera-${Date.now()}.y4m`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...[1, 2, 3].flatMap(() => [Buffer.from('FRAME\n'), Y, UV, UV])]));
  return launch(['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${file}`]);
}
const openDogCard = async (page, name) => {
  await page.click('#tabbar [data-view="dogs"]');
  await page.fill('#dog-q', name);
  await page.click(`.dogcard:has(.nm:text-is("${name}"))`);
  await page.waitForSelector('.drawer h2');
};

test('connecting a phone: the app scans the computer’s code, says which sheet, and keeps nothing until you agree', async () => {
  const cam = await cameraSeeing(code(BRIDGE, KEY));
  try {
    const { page, ctx, errors, calls } = await openPhone({ browser: cam, prefs: null, wait: '#view .setup', context: { permissions: ['camera'] } });
    assert.equal(await page.evaluate(() => !!window.jsQR), false, 'the code reader loads only when scanning');
    await page.click('[data-action="scan-connect"]');
    await page.waitForSelector('form.mcard h2:text("Connect this phone?")', { timeout: 20000 });
    assert.match(await page.textContent('form.mcard'), /Test Kennel Records \(web app …456789\)/);
    assert.equal(await page.evaluate(() => localStorage.getItem('k9.prefs')), null, 'nothing is kept before you agree');
    await page.fill('#cn-who', 'Pat Phone');
    await page.click('form.mcard button[type=submit]');
    await page.waitForSelector('.quick');
    const prefs = JSON.parse(await page.evaluate(() => localStorage.getItem('k9.prefs')));
    assert.deepEqual([prefs.url, prefs.key, prefs.who], [BRIDGE, KEY, 'Pat Phone']);
    assert.ok(!calls.some(c => c.preflight), 'no preflight requests, which Google’s web apps don’t answer');
    assert.ok(calls.every(c => /^text\/plain/.test(c.contentType) && !c.cookie), 'plain-text requests without cookies, which Google answers from any site');
    assert.ok(calls.some(c => c.payload.action === 'ping') && calls.some(c => c.payload.action === 'read'));
    assert.ok(await page.isVisible('#tabbar'), 'the sections sit along the bottom');
    assert.ok(!(await page.isVisible('.rail')), 'the side menu stays out of the way');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await cam.close(); }
});

test('a key in the address is never used or kept', async () => {
  const { page, ctx, errors, calls } = await openPhone({ prefs: null, hash: `#s=AKfycbTEST0123456789&k=${KEY}`, wait: '#view .setup' });
  assert.equal(page.url(), `${ORIGIN}/k9/`, 'taken out of the address bar straight away');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.mcard').count(), 0);
  assert.equal(calls.length, 0, 'nothing is sent anywhere');
  assert.equal(await page.evaluate(() => localStorage.getItem('k9.prefs')), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('tapping reload while the first load is still coming waits for it instead of starting again', async () => {
  const { page, ctx, errors, calls } = await openPhone({ slowRead: { [BRIDGE]: 1500 }, wait: false });
  await page.waitForSelector('#sync-mini .ic');
  await page.click('#sync-mini');
  await page.click('#sync-mini');
  await page.waitForSelector('.quick', { timeout: 15000 });
  await page.waitForTimeout(500);
  assert.equal(calls.filter(c => c.payload && c.payload.action === 'read').length, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a wrong key, or a bridge that asks people to sign in, is explained and nothing is kept', async () => {
  const cam = await cameraSeeing(code(BRIDGE, 'x'.repeat(40)));
  try {
    const { page, ctx, errors } = await openPhone({ browser: cam, prefs: null, wait: '#view .setup', context: { permissions: ['camera'] } });
    await page.click('[data-action="scan-connect"]');
    await page.waitForSelector('.toast.err', { timeout: 20000 });
    assert.match(await page.textContent('.toast.err'), /access key doesn’t match/);
    await page.waitForSelector('.mcard', { state: 'detached' }); // the scanner closes, and nothing is offered
    // the manual form: a deployment that only lets signed-in people in
    G.mode = 'signin';
    await page.click('details.manual summary');
    await page.fill('#setup-form-url', BRIDGE);
    await page.fill('#setup-form-key', KEY);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#setup-form-key')).fontSize), '16px', 'big enough that iPhones don’t zoom in');
    await page.click('#setup-form button[type=submit]');
    await page.waitForFunction(() => /Who has access/.test(document.querySelector('#setup-form .set-msg').textContent));
    assert.equal(await page.evaluate(() => localStorage.getItem('k9.prefs')), null);
    errors.splice(0, errors.length, ...errors.filter(e => !/blocked by CORS policy/.test(e))); // the browser's own note about the sign-in page
    // fixed: it connects, and keeps the name typed with it
    G.mode = 'ok';
    await page.fill('#setup-form-who', 'Kim Kennel');
    await page.click('#setup-form button[type=submit]');
    await page.waitForSelector('.quick');
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('k9.prefs'))).who, 'Kim Kennel');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await cam.close(); }
});

test('switching to another sheet says which is which, and a read still on its way from the old one is ignored', async () => {
  const ssB = sheetFromFixture();
  ssB.getSheetByName('All Breeds').getRange(2, 3).setValue('Zebra');
  const cam = await cameraSeeing(code(BRIDGE_B, KEY));
  try {
    const { page, ctx, errors, calls } = await openPhone({ browser: cam, bridges: { [BRIDGE_B]: loadBridge(ssB) }, context: { permissions: ['camera'] } });
    G.slowRead[BRIDGE] = 2500;
    await page.click('#sync-mini'); // a read from the first sheet, still on its way
    await page.click('#tabbar [data-action="menu"]');
    await page.click('#nav [data-view="settings"]');
    await page.click('#set-connection [data-action="scan-connect"]');
    await page.waitForSelector('form.mcard h2:text("Switch this phone to another sheet?")', { timeout: 20000 });
    const text = await page.textContent('form.mcard');
    assert.match(text, /web app …bbbbbb/);
    assert.match(text, /now uses Test Kennel Records \(web app …456789\)/);
    await page.click('form.mcard button[type=submit]');
    await page.waitForSelector('.quick');
    await page.waitForTimeout(3000); // the old read arrives meanwhile
    await page.click('#tabbar [data-view="dogs"]');
    await page.fill('#dog-q', 'Zebra');
    assert.equal(await page.locator('.dogcard').count(), 1, 'the new sheet’s dogs are shown');
    assert.ok(calls.some(c => c.at === BRIDGE_B && c.payload.action === 'read'), 'the new sheet was read');
    assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('k9.prefs'))).url, BRIDGE_B);
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await cam.close(); }
});

test('on a phone, a vaccination logged from a dog’s profile is written to the sheet by the real bridge', async () => {
  const { page, ctx, errors, calls, ss } = await openPhone();
  await openDogCard(page, 'Pepper');
  await page.click('.drawer [data-action="new-entry"][data-tab="Vaccinations"]');
  await page.waitForSelector('form.mcard');
  await page.fill('form.mcard label:has-text("Date Given") + input', '2026-10-20');
  await page.fill('form.mcard label:has-text("Vaccine Type") + input', 'Rabies');
  await page.click('#form-save');
  await page.waitForSelector('form.mcard', { state: 'detached' });
  const vac = ss.getSheetByName('Vaccinations');
  const row = vac.getRange(4, 1, 1, 4).getValues()[0];
  assert.equal(row[0], chip(2));
  assert.equal(row[3], 'Rabies');
  const save = calls.find(c => c.payload && c.payload.action === 'save');
  assert.equal(save.payload.who, 'Sam Tester');
  assert.ok(save.payload.opId, 'retry-safe, as on the computer');
  const log = ss.getSheetByName('App Change Log');
  assert.ok(log && log.getLastRow() >= 2, 'the change history records it');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the phone makes the health record, monthly and due-list PDFs itself, and they are sound', async () => {
  const { page, ctx, errors } = await openPhone();
  await openDogCard(page, 'Biscuit');
  await page.click('.drawer [data-action="pdf-dog"]');
  const dog = await saveOffered(page);
  assert.equal(await page.textContent('.mcard h2'), 'Your PDF is ready');
  assert.match(dog.name, /^Health record Biscuit T001 \d{4}-\d{2}-\d{2}\.pdf$/);
  const d = readPdf(dog.buf);
  assert.equal(d.pages, 1);
  for (const t of ['(Health record: Biscuit) Tj', '(Biscuit) Tj', `(${chip(0)}) Tj`, '(DHPPi) Tj', '(TEST KENNEL) Tj', '/F5 ']) assert.ok(d.text.includes(t), `the health record shows ${t}`);
  await page.click('.mcard [data-action="close-top"]');
  await page.click('.drawer [data-action="close-top"]');
  await page.click('#tabbar [data-action="menu"]');
  await page.click('#nav [data-view="reports"]');
  await page.click('[data-action="pdf-month"]');
  const month = readPdf((await saveOffered(page)).buf);
  assert.ok(month.pages >= 2, 'a long report runs onto more pages');
  assert.ok(month.text.includes('(Litters born) Tj') && month.text.includes('(Vaccinations) Tj'));
  await page.click('.mcard [data-action="close-top"]');
  await page.click('[data-action="report-tab"][data-tab="due"]');
  await page.click('[data-action="pdf-due"]');
  const due = readPdf((await saveOffered(page)).buf);
  assert.ok(due.text.includes('(Due list) Tj') && /(re|h) S\n/.test(due.text), 'tick boxes are drawn');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a name the PDF fonts can’t show is drawn as a picture of the text', async () => {
  const ss = sheetFromFixture();
  ss.getSheetByName('All Breeds').getRange(2, 3).setValue('小饼干 Biscuit');
  const { page, ctx, errors } = await openPhone({ ss });
  await page.click('#tabbar [data-view="dogs"]');
  await page.click('.dogcard >> nth=0');
  await page.waitForSelector('.drawer h2');
  await page.click('.drawer [data-action="pdf-dog"]');
  const pdf = (await saveOffered(page)).buf;
  const d = readPdf(pdf);
  assert.ok(/\/SMask \d+ 0 R/.test(pdf.toString('latin1')), 'the Chinese name is a see-through picture');
  assert.ok(/\/Tx\d+ Do/.test(d.text));
  assert.ok(!d.text.includes('?'.repeat(3)), 'no question marks in place of letters');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('documents on a phone: camera photos become one PDF, a single photo stays a photo, and both open to share or save', async () => {
  const { page, ctx, errors, calls } = await openPhone();
  await openDogCard(page, 'Luna');
  await page.click('.drawer [data-action="doc-add"][data-type="Import permit"]');
  await page.waitForSelector('#dc-cam');
  assert.equal(await page.getAttribute('#dc-cam', 'capture'), 'environment', 'Take a photo opens the camera');
  await page.setInputFiles('#dc-cam', await photo(page, 'Page 1'));
  await page.setInputFiles('#dc-cam', await photo(page, 'Page 2'));
  assert.match(await page.textContent('#dc-files'), /2 photos/);
  await page.click('#dc-save');
  await page.waitForSelector('form.mcard', { state: 'detached', timeout: 30000 });
  const up = calls.find(c => c.payload && c.payload.action === 'doc_upload').payload;
  assert.equal(up.mime, 'application/pdf');
  assert.equal(up.type, 'Import permit');
  const sent = Buffer.from(up.data, 'base64');
  assert.equal(readPdf(sent).pages, 2, 'a page for each photo');
  await page.waitForSelector('.drawer .doc');
  await page.click('.drawer [data-action="doc-open"]');
  const got = await saveOffered(page);
  assert.ok(got.buf.equals(sent), 'opening it gives back the same file');
  assert.match(got.name, /\.pdf$/);
  await page.click('.mcard [data-action="close-top"]');
  // one photo
  await page.click('.drawer [data-action="doc-add"]:not([data-type])');
  await page.waitForSelector('#dc-cam');
  await page.selectOption('#dc-type', 'Vaccination record');
  await page.setInputFiles('#dc-cam', await photo(page, 'Card'));
  await page.click('#dc-save');
  await page.waitForSelector('form.mcard', { state: 'detached', timeout: 30000 });
  assert.equal(calls.filter(c => c.payload && c.payload.action === 'doc_upload').pop().payload.mime, 'image/jpeg');
  await page.click('.drawer .doc:has-text("Vaccination record") [data-action="doc-open"]');
  await page.waitForSelector('.mcard .viewer-img');
  assert.ok(await page.evaluate(() => document.querySelector('.viewer-img').naturalWidth > 0), 'the photo shows on the phone');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the phone layout fits: no sideways scrolling on any screen, with extra large text too', async () => {
  for (const textSize of [1, 1.3]) {
    const { page, ctx, errors } = await openPhone({ context: { viewport: { width: 360, height: 740 } }, prefs: { url: BRIDGE, key: KEY, who: 'Sam Tester', textSize } });
    const fits = async where => {
      const r = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1, main: document.querySelector('#main').scrollWidth <= document.querySelector('#main').clientWidth + 1, tall: document.documentElement.scrollHeight <= document.documentElement.clientHeight + 1 }));
      assert.ok(r.doc && r.main, `${where} fits at text size ${textSize}`);
      assert.ok(r.tall, `${where}: no empty space to scroll into below the page`);
    };
    await fits('home');
    for (const v of ['dogs', 'breeding', 'records']) { await page.click(`#tabbar [data-view="${v}"]`); await fits(v); }
    await page.click('[data-action="nav"][data-tab="Vaccinations"]'); await fits('a record list');
    for (const v of ['reports', 'settings']) { await page.click('#tabbar [data-action="menu"]'); await page.click(`#nav [data-view="${v}"]`); await fits(v); }
    await openDogCard(page, 'Biscuit');
    const drawer = await page.evaluate(() => { const b = document.querySelector('.dr-b'); return b.scrollWidth <= b.clientWidth + 1; });
    assert.ok(drawer, 'the dog’s profile fits');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('More opens every section, keeps the focus inside, and Escape closes it again', async () => {
  const { page, ctx, errors } = await openPhone();
  const more = page.locator('#tabbar [data-action="menu"]');
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  await more.click();
  await page.waitForFunction(() => document.querySelector('#rail').contains(document.activeElement));
  assert.equal(await more.getAttribute('aria-expanded'), 'true');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.querySelector('#rail').contains(document.activeElement)), 'Tab stays in the menu');
  await page.keyboard.press('Escape');
  assert.ok(await page.evaluate(() => document.activeElement === document.querySelector('#tabbar [data-action="menu"]')), 'focus goes back to More');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#rail')).visibility === 'hidden'); // the closed menu can't be tabbed into
  await more.click();
  await page.click('#nav [data-view="settings"]');
  assert.equal(await page.getAttribute('#tabbar [data-action="menu"]', 'aria-current'), 'true', 'More shows as current for the sections inside it');
  assert.equal(await page.locator('#set-phone').count(), 0, 'no phone code on the phone itself');
  assert.match(await page.textContent('#set-updates'), /newest version loads each time/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the home screen: the app offers to install, and the iPhone gets the Share instructions instead', async () => {
  const { page, ctx, errors } = await openPhone();
  assert.equal(await page.locator('[data-action="install-app"]').count(), 0);
  // the offer arrives while someone is typing in Settings: what they typed stays put
  await page.click('#tabbar [data-action="menu"]');
  await page.click('#nav [data-view="settings"]');
  await page.fill('#conn-form-key', 'half typed');
  await page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await page.waitForSelector('.banner [data-action="install-app"]');
  assert.equal(await page.inputValue('#conn-form-key'), 'half typed');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'conn-form-key');
  await page.click('.banner [data-action="install-app"]');
  await page.waitForSelector('.banner [data-action="install-app"]', { state: 'detached' });
  assert.equal(await page.evaluate(() => window.__prompted), true);
  assert.deepEqual(errors, []);
  await ctx.close();
  const ios = await openPhone({ context: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } });
  await ios.page.waitForSelector('.banner [data-action="install-off"]');
  assert.match(await ios.page.textContent('.banner.soft'), /Add to Home Screen/);
  await ios.page.click('.banner [data-action="install-off"]');
  await ios.page.reload();
  await ios.page.waitForSelector('.quick');
  assert.equal(await ios.page.locator('.banner [data-action="install-off"]').count(), 0, 'once dismissed, it stays away');
  await ios.ctx.close();
});

test('the home screen app keeps only its own files, checks them, and still opens without a connection', async () => {
  const { page, ctx, errors } = await openPhone({ sw: 'allow' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForSelector('.quick');
  assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the page runs under the service worker');
  const man = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  assert.equal(man.display, 'standalone');
  assert.equal(man.start_url, './');
  for (const ic of man.icons) {
    const ok = await page.evaluate(async src => { const r = await fetch(src); const b = new Uint8Array(await r.arrayBuffer()); return r.ok && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47; }, ic.src);
    assert.ok(ok, `${ic.src} is a PNG`);
  }
  assert.ok(man.icons.some(i => i.purpose === 'maskable'));
  // only the app's files are kept: never the bridge's replies, never the bridge script or other pages
  await page.evaluate(() => fetch('K9AppBridge.gs'));
  const kept = await page.evaluate(async () => { const names = (await caches.keys()).filter(k => k.startsWith('k9-salon-')); const c = await caches.open(names[0]); return { names, urls: (await c.keys()).map(r => r.url) }; });
  assert.equal(kept.names.length, 1);
  assert.ok(kept.urls.length >= 8);
  assert.ok(kept.urls.every(u => u.startsWith(`${ORIGIN}/k9/`) && /\/k9\/($|app\.js|app\.css|fonts|k9-web\.js|manifest|icons\/)/.test(u)), `only app files: ${kept.urls.join(' ')}`);
  // a copy changed by another page on the same site is never used
  await page.evaluate(async () => { const n = (await caches.keys()).find(k => k.startsWith('k9-salon-')); const c = await caches.open(n); const k = (await c.keys()).find(r => /app\.js/.test(r.url)); await c.put(k, new Response('document.title = "PWNED";', { headers: { 'Content-Type': 'application/javascript' } })); });
  const fresh = await ctx.newPage(); // a new tab, which is where a kept copy would be used
  await fresh.goto(`${ORIGIN}/k9/`);
  await fresh.waitForSelector('.quick');
  assert.notEqual(await fresh.title(), 'PWNED');
  await fresh.close();
  // no connection at all: the kept page still opens
  G.siteDown = true;
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#view .empty', { timeout: 15000 });
  assert.match(await page.textContent('#view'), /couldn’t load|Not connected/i);
  assert.ok(await page.isVisible('#tabbar'));
  await ctx.setOffline(false);
  G.siteDown = false;
  assert.deepEqual(errors.filter(e => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_EMPTY_RESPONSE|ERR_CONNECTION/.test(e)), []);
  await ctx.close();
});

test('another site can’t show the app inside its own page', async () => {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  await page.setContent(`<iframe src="${ORIGIN}/k9/" style="width:390px;height:600px"></iframe>`);
  const frame = await (await page.waitForSelector('iframe')).contentFrame();
  await frame.waitForFunction(() => document.body && /own browser tab/.test(document.body.textContent));
  assert.equal(await frame.locator('#shell').count(), 0);
  await ctx.close();
});

test('the phone’s Back button closes what’s open, one step at a time, instead of leaving the app', async () => {
  const { page, ctx, errors } = await openPhone();
  const back = () => page.evaluate(() => history.back());
  const start = await page.evaluate(() => history.length);
  await openDogCard(page, 'Pepper');
  await page.click('.drawer [data-action="new-entry"][data-tab="Vaccinations"]');
  await page.waitForSelector('form.mcard');
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => history.length), start + 1, 'one extra step, however many things are open');
  await back();
  await page.waitForSelector('form.mcard', { state: 'detached' });
  assert.ok(await page.isVisible('.drawer'), 'the profile is still open');
  await back();
  await page.waitForSelector('.drawer', { state: 'detached' });
  assert.ok(await page.isVisible('.dogcards'), 'still in the app, on the dogs list');
  // a form with changes asks first, and Back still works afterwards
  await page.click('.top [data-action="add-dog"]');
  await page.waitForSelector('form.mcard');
  await page.fill('form.mcard label:has-text("Name") + input', 'Waffle Two');
  await page.waitForTimeout(50);
  await back();
  await page.waitForSelector('.guard');
  assert.ok(await page.isVisible('form.mcard'), 'unsaved changes aren’t thrown away by Back');
  await page.click('[data-action="guard-discard"]');
  await page.waitForSelector('form.mcard', { state: 'detached' });
  // a search result closes the search and opens the profile in one step: Back still closes the profile
  await page.click('.searchbtn');
  await page.fill('#pal-q', 'Mochi');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.drawer h2:text("Mochi")');
  await page.waitForTimeout(100);
  await back();
  await page.waitForSelector('.drawer', { state: 'detached' });
  assert.ok(page.url().startsWith(`${ORIGIN}/k9/`), 'still in the app');
  // and again, closed with its X button this time, then Back from a fresh profile
  await page.click('.searchbtn');
  await page.fill('#pal-q', 'Pepper');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.drawer h2:text("Pepper")');
  await page.click('.drawer [data-action="close-top"]');
  await page.waitForSelector('.drawer', { state: 'detached' });
  await page.waitForTimeout(300);
  assert.ok(page.url().startsWith(`${ORIGIN}/k9/`), 'closing it doesn’t leave the app');
  await openDogCard(page, 'Biscuit');
  await page.waitForTimeout(50); // (a person can't press Back within the same moment)
  await back();
  await page.waitForSelector('.drawer', { state: 'detached' });
  assert.ok(page.url().startsWith(`${ORIGIN}/k9/`));
  // reloaded while a profile was open: the first Back after that still closes what's open
  await openDogCard(page, 'Mochi');
  await page.waitForTimeout(50);
  await page.reload();
  await page.waitForSelector('.dogcards'); // it reopens on the Dogs page
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => history.state), null, 'the leftover step is used up');
  await openDogCard(page, 'Pepper');
  await page.waitForTimeout(50);
  await back();
  await page.waitForSelector('.drawer', { state: 'detached' });
  assert.ok(page.url().startsWith(`${ORIGIN}/k9/`));
  // the sections menu too
  await page.click('#tabbar [data-action="menu"]');
  await page.waitForFunction(() => document.querySelector('#shell').classList.contains('nav-open'));
  await page.waitForTimeout(50);
  await back();
  await page.waitForFunction(() => !document.querySelector('#shell').classList.contains('nav-open'));
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => history.length), start + 1, 'no steps pile up');
  assert.ok(page.url().startsWith(`${ORIGIN}/k9/`));
  assert.deepEqual(errors, []);
  await ctx.close();
});
