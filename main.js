'use strict';
const { app, BrowserWindow, ipcMain, shell, clipboard, Menu, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const pkg = require('./package.json');

const APP_ID = 'sg.k9salon.manager';
const APPS_SCRIPT_URL = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/;
const REPO = (pkg.k9 && pkg.k9.repo) || '';
const UPDATE_FEED = REPO ? `https://github.com/${REPO}/releases/latest/download/latest.json` : '';
const UPDATE_HOSTS = new Set(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'github-releases.githubusercontent.com']);
const PREF_KEYS = ['url', 'key', 'who', 'textSize', 'contrast', 'theme', 'notify', 'autoUpdate', 'scanner', 'sheetId'];

/* ---------- settings on this computer ---------- */
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch (e) { return {}; }
}
function writeSettings(next) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  const tmp = settingsPath() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, settingsPath());
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
  if ('scanner' in p && p.scanner && typeof p.scanner === 'object') {
    const s = p.scanner;
    out.scanner = { serial: !!s.serial, baud: [9600, 19200, 38400, 57600, 115200].includes(Number(s.baud)) ? Number(s.baud) : 115200, port: s.port && typeof s.port === 'object' ? { v: Number(s.port.v) || 0, p: Number(s.port.p) || 0 } : null };
  }
  return out;
}

/* ---------- the bridge script ---------- */
const WRITE_ACTIONS = ['save', 'batch', 'settings_set', 'photo_upload', 'digest_test'];
async function postToBridge(url, key, payload) {
  if (!url || !key) return { ok: false, error: 'not_setup' };
  if (!APPS_SCRIPT_URL.test(url)) return { ok: false, error: 'bad_url' };
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({}, payload, { key })),
      redirect: 'follow',
      signal: AbortSignal.timeout(WRITE_ACTIONS.includes(payload && payload.action) ? 360000 : 120000),
    });
  } catch (err) {
    return { ok: false, error: err && err.name === 'TimeoutError' ? 'timeout' : 'network', message: String((err && err.message) || err) };
  }
  const text = await res.text();
  try { return JSON.parse(text); } catch (e) { return { ok: false, error: 'bad_reply', status: res.status }; }
}

let win = null;
function createWindow() {
  const st = readSettings();
  win = new BrowserWindow({
    width: st.width || 1360,
    height: st.height || 880,
    minWidth: 900,
    minHeight: 600,
    title: 'K-9 Salon Manager',
    backgroundColor: '#F4F5F0',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  if (st.maximized) win.maximize();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.on('did-finish-load', () => { if (st.textSize) win.webContents.setZoomFactor(Number(st.textSize) || 1); });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://') && url.split('#')[0] === win.webContents.getURL().split('#')[0]) return;
    event.preventDefault();
    if (/^https:\/\//.test(url)) shell.openExternal(url);
  });
  win.webContents.on('will-attach-webview', e => e.preventDefault());
  win.on('page-title-updated', e => e.preventDefault()); // the installer finds the window by this title
  win.on('close', () => {
    const b = win.getNormalBounds();
    writeSettings(Object.assign(readSettings(), { width: b.width, height: b.height, maximized: win.isMaximized() }));
  });
  win.on('closed', () => { win = null; });
}

/* ---------- preferences and bridge calls ---------- */
ipcMain.handle('k9:get-prefs', () => {
  const s = readSettings();
  const out = {};
  PREF_KEYS.forEach(k => { if (k in s) out[k] = s[k]; });
  return out;
});
ipcMain.handle('k9:set-prefs', (event, patch) => {
  const clean = cleanPrefs(patch);
  if (clean.url && !APPS_SCRIPT_URL.test(clean.url)) return { ok: false, error: 'bad_url' };
  writeSettings(Object.assign(readSettings(), clean));
  return { ok: true };
});
ipcMain.handle('k9:call', (event, payload) => {
  const s = readSettings();
  return postToBridge(s.url, s.key, payload || {});
});
ipcMain.handle('k9:test', (event, input) => postToBridge(String((input && input.url) || '').trim(), String((input && input.key) || '').trim(), { action: 'ping' }));
ipcMain.handle('k9:copy', (event, text) => { clipboard.writeText(String(text)); return true; });
ipcMain.handle('k9:bridge-script', () => fs.readFileSync(path.join(__dirname, 'apps-script', 'K9AppBridge.gs'), 'utf8'));
ipcMain.handle('k9:version', () => app.getVersion());
ipcMain.handle('k9:zoom', (event, factor) => { const f = Math.min(1.6, Math.max(0.8, Number(factor) || 1)); event.sender.setZoomFactor(f); return f; });
ipcMain.handle('k9:focus', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });

/* ---------- photos (cached on this computer) ---------- */
ipcMain.handle('k9:photo', async (event, id) => {
  id = String(id || '');
  if (!/^[\w-]{6,120}$/.test(id)) return { ok: false };
  const dir = path.join(app.getPath('userData'), 'photos');
  const file = path.join(dir, id + '.jpg');
  try { const buf = await fsp.readFile(file); return { ok: true, url: 'data:image/jpeg;base64,' + buf.toString('base64') }; } catch (e) { /* not cached yet */ }
  const s = readSettings();
  const res = await postToBridge(s.url, s.key, { action: 'photo_get', id });
  if (!res || !res.ok || !res.data) return { ok: false };
  const mime = /^image\/(jpeg|png|webp)$/.test(res.mime) ? res.mime : 'image/jpeg';
  await fsp.mkdir(dir, { recursive: true });
  if (mime === 'image/jpeg') await fsp.writeFile(file, Buffer.from(res.data, 'base64'));
  return { ok: true, url: `data:${mime};base64,${res.data}` };
});

/* ---------- PDFs ---------- */
let fontCSS = null;
function fontFaces() {
  if (fontCSS !== null) return fontCSS;
  const f = n => fs.readFileSync(path.join(__dirname, 'renderer', 'fonts', n)).toString('base64');
  try {
    fontCSS = `@font-face{font-family:"Nunito Sans";font-weight:200 1000;src:url(data:font/woff2;base64,${f('nunito-sans-latin-wght-normal.woff2')}) format("woff2")}`
      + `@font-face{font-family:"IBM Plex Mono";font-weight:400;src:url(data:font/woff2;base64,${f('ibm-plex-mono-latin-400-normal.woff2')}) format("woff2")}`;
  } catch (e) { fontCSS = ''; }
  return fontCSS;
}
ipcMain.handle('k9:pdf', async (event, input) => {
  const html = String((input && input.html) || '').replace('/*FONTS*/', fontFaces());
  const name = (String((input && input.filename) || 'K-9 Salon.pdf').replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').trim() || 'K-9 Salon.pdf').replace(/(\.pdf)?$/i, '.pdf');
  const tmp = path.join(app.getPath('temp'), `k9-print-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  await fsp.writeFile(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true } });
  try {
    await w.loadFile(tmp);
    const data = await w.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
    const { canceled, filePath } = await dialog.showSaveDialog(win, { title: 'Save PDF', defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (canceled || !filePath) return { ok: false, cancelled: true };
    await fsp.writeFile(filePath, data);
    shell.openPath(filePath);
    return { ok: true, name: path.basename(filePath), path: filePath };
  } catch (e) {
    return { ok: false, message: String((e && e.message) || e) };
  } finally {
    w.destroy();
    fsp.unlink(tmp).catch(() => {});
  }
});

/* ---------- serial scanners ---------- */
let pendingSerial = null;
function setupSerial() {
  const ses = session.defaultSession;
  ses.on('select-serial-port', (event, portList, webContents, callback) => {
    event.preventDefault();
    if (pendingSerial) pendingSerial('');
    pendingSerial = callback;
    webContents.send('k9:serial-ports', portList.map(p => ({ portId: p.portId, portName: p.portName, displayName: p.displayName, vendorId: p.vendorId, productId: p.productId })));
  });
  ses.setPermissionCheckHandler((wc, permission) => ['serial', 'notifications', 'clipboard-sanitized-write'].includes(permission));
  ses.setPermissionRequestHandler((wc, permission, cb) => cb(['notifications', 'clipboard-sanitized-write'].includes(permission)));
  ses.setDevicePermissionHandler(details => details.deviceType === 'serial');
}
ipcMain.handle('k9:serial-choose', (event, portId) => { const cb = pendingSerial; pendingSerial = null; if (cb) cb(String(portId || '')); });

/* ---------- Windows notifications need a Start menu shortcut with our app ID ---------- */
function ensureShortcut() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'K-9 Salon Manager.lnk');
  try {
    if (fs.existsSync(lnk)) {
      const cur = shell.readShortcutLink(lnk);
      if (cur.appUserModelId !== APP_ID) shell.writeShortcutLink(lnk, 'update', { appUserModelId: APP_ID });
    } else {
      shell.writeShortcutLink(lnk, 'create', { target: process.execPath, appUserModelId: APP_ID, description: 'K-9 Salon Manager' });
    }
  } catch (e) { /* notifications may not show; the app still works */ }
}

/* ---------- automatic updates from GitHub Releases ---------- */
const UP = { state: 'idle', version: '', progress: 0, file: '', sha256: '', message: '', notes: '' };
let installing = false;
function sendUp(extra) {
  Object.assign(UP, extra);
  if (win && !win.isDestroyed()) win.webContents.send('k9:update', Object.assign({}, UP, { file: undefined, sha256: undefined }));
}
function newer(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
}
async function sha256File(file) {
  const h = crypto.createHash('sha256');
  await new Promise((resolve, reject) => fs.createReadStream(file).on('data', c => h.update(c)).on('end', resolve).on('error', reject));
  return h.digest('hex');
}
async function checkUpdates(manual) {
  if (!UPDATE_FEED) return sendUp({ state: 'disabled', manual });
  if (process.platform !== 'win32' || !app.isPackaged) return sendUp({ state: 'unsupported', manual });
  if (UP.state === 'checking' || UP.state === 'downloading') return;
  if (UP.state === 'ready') return sendUp({ manual });
  sendUp({ state: 'checking', manual, message: '' });
  try {
    const res = await fetch(UPDATE_FEED, { signal: AbortSignal.timeout(20000), headers: { 'Cache-Control': 'no-cache' } });
    if (res.status === 404) return sendUp({ state: 'none', manual, version: app.getVersion() });
    if (!res.ok) throw new Error(`the update server answered ${res.status}`);
    const info = await res.json();
    if (!info || !/^\d+\.\d+\.\d+$/.test(info.version) || !/^[a-f0-9]{64}$/i.test(info.sha256 || '') || !/^[\w.-]+\.exe$/.test(info.file || '')) throw new Error('the update information was incomplete');
    if (!newer(info.version, app.getVersion())) return sendUp({ state: 'none', manual, version: info.version });
    sendUp({ state: 'available', version: info.version, notes: String(info.notes || '').slice(0, 2000), manual });
    if (readSettings().autoUpdate === false && !manual) return;
    await downloadUpdate(info, manual);
  } catch (e) {
    sendUp({ state: 'error', message: `Couldn’t check for updates: ${(e && e.message) || e}.`, manual });
  }
}
async function downloadUpdate(info, manual) {
  const dir = path.join(app.getPath('temp'), 'k9-salon-update');
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, info.file);
  if (fs.existsSync(dest) && (await sha256File(dest)) === info.sha256.toLowerCase()) return sendUp({ state: 'ready', version: info.version, progress: 100, file: dest, sha256: info.sha256.toLowerCase(), manual });
  const url = `https://github.com/${REPO}/releases/download/v${info.version}/${encodeURIComponent(info.file)}`;
  sendUp({ state: 'downloading', version: info.version, progress: 0, manual });
  const res = await fetch(url, { signal: AbortSignal.timeout(30 * 60000) });
  if (!res.ok || !res.body) throw new Error(`the download failed (${res.status})`);
  if (!UPDATE_HOSTS.has(new URL(res.url).hostname)) throw new Error('the download came from an unexpected address');
  const total = Number(res.headers.get('content-length')) || Number(info.size) || 0;
  const part = dest + '.part';
  const hash = crypto.createHash('sha256');
  const out = fs.createWriteStream(part);
  let got = 0, lastPct = -1;
  await new Promise((resolve, reject) => {
    const src = Readable.fromWeb(res.body);
    src.on('data', c => {
      hash.update(c); got += c.length;
      const pct = total ? Math.floor(got / total * 100) : 0;
      if (pct >= lastPct + 5) { lastPct = pct; sendUp({ progress: pct }); }
    });
    src.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    src.pipe(out);
  });
  if (hash.digest('hex') !== info.sha256.toLowerCase()) {
    await fsp.unlink(part).catch(() => {});
    throw new Error('the download didn’t match its checksum, so it was thrown away');
  }
  await fsp.rename(part, dest);
  sendUp({ state: 'ready', version: info.version, progress: 100, file: dest, sha256: info.sha256.toLowerCase(), manual });
}
function runInstaller(relaunch) {
  if (!UP.file || !UP.sha256 || !fs.existsSync(UP.file)) return false;
  // check the file again: it may have sat in the temp folder for hours
  const now = crypto.createHash('sha256').update(fs.readFileSync(UP.file)).digest('hex');
  if (now !== UP.sha256) { try { fs.unlinkSync(UP.file); } catch (e) { /* ignore */ } sendUp({ state: 'error', message: 'The downloaded update changed on disk, so it was thrown away. It will download again.', file: '', sha256: '' }); return false; }
  const args = ['/S'];
  if (relaunch) args.push('--force-run');
  spawn(UP.file, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  return true;
}
ipcMain.handle('k9:update-state', () => Object.assign({}, UP, { file: undefined, sha256: undefined }));
ipcMain.handle('k9:update-check', () => { checkUpdates(true); return true; });
ipcMain.handle('k9:update-install', () => {
  if (UP.state !== 'ready') return { ok: false };
  installing = true;
  if (!runInstaller(true)) { installing = false; return { ok: false }; }
  setTimeout(() => app.quit(), 300);
  return { ok: true };
});

/* ---------- start ---------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    setupSerial();
    ensureShortcut();
    createWindow();
    setTimeout(() => checkUpdates(false), 20000);
    setInterval(() => checkUpdates(false), 4 * 3600 * 1000);
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    if (!installing && UP.state === 'ready' && readSettings().autoUpdate !== false) { installing = true; runInstaller(false); }
  });
}
