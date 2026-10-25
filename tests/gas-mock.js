'use strict';
/**
 * A small in-memory stand-in for the Google Apps Script services the bridge uses.
 * It models values, formulas, number formats and the "user entered" parsing that
 * setValue/setValues apply, closely enough to test what the bridge writes.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const TZ_OFFSET = { 'Asia/Kuala_Lumpur': 8, 'Asia/Singapore': 8, GMT: 0, UTC: 0 };
const DAY = 864e5;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n, w = 2) => String(n).padStart(w, '0');

function shifted(date, tz) {
  const off = TZ_OFFSET[tz];
  if (off === undefined) throw new Error('mock: unknown time zone ' + tz);
  return new Date(date.getTime() + off * 36e5);
}

const Utilities = {
  formatDate(date, tz, pattern) {
    const d = shifted(date, tz);
    return pattern.replace(/yyyy|MMM|MM|dd|EEE|HH|mm|d/g, t => ({
      yyyy: d.getUTCFullYear(), MMM: MON[d.getUTCMonth()], MM: pad(d.getUTCMonth() + 1), dd: pad(d.getUTCDate()),
      EEE: DOW[d.getUTCDay()], HH: pad(d.getUTCHours()), mm: pad(d.getUTCMinutes()), d: d.getUTCDate(),
    }[t]));
  },
  parseDate(str, tz, pattern) {
    if (pattern !== 'yyyy-MM-dd') throw new Error('mock: unsupported pattern ' + pattern);
    const [y, m, d] = str.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) - TZ_OFFSET[tz] * 36e5);
  },
  getUuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, () => (Math.random() * 16 | 0).toString(16)),
  sleep: () => {},
  base64Decode: s => Array.from(Buffer.from(s, 'base64')),
  base64Encode: bytes => Buffer.from(bytes).toString('base64'),
  newBlob: (bytes, mime, name) => new Blob_(bytes, mime, name),
};

class Blob_ {
  constructor(bytes, mime, name) { this.bytes = bytes; this.mime = mime; this.name = name; }
  getBytes() { return this.bytes; }
  getContentType() { return this.mime; }
  getName() { return this.name; }
}

/** Mimics how Sheets parses a value typed or written with setValue(s). */
function enter(cell, v, where) {
  if (v === null || v === undefined) return;
  if (cell.rule && !cell.rule.allowInvalid && v !== '') { // list items match ignoring spaces around them (assumed, as for typed lists)
    const t = cell.rule.type, text = String(v).replace(/^'/, '');
    const bad = (t === 'VALUE_IN_LIST' && !cell.rule.values.map(x => String(x).trim()).includes(text.trim())) || (t === 'NUMBER_GREATER_THAN' && !(Number(v) > cell.rule.values[0])) || (t === 'CHECKBOX' && typeof v !== 'boolean');
    if (bad) throw new Error(`The data you entered in cell ${where || ''} violates the data validation rules set on this cell.`);
  }
  delete cell.f;
  if (v instanceof Date || typeof v === 'number' || typeof v === 'boolean') { cell.v = v; return; }
  const s = String(v);
  if (cell.fmt === '@') { cell.v = s; return; } // plain-text cells keep the string exactly, apostrophe and all
  if (s.startsWith("'")) { cell.v = s.slice(1); return; }
  if (s.startsWith('=')) { cell.f = s; cell.v = ''; return; }
  if (/^-?\d+(\.\d+)?$/.test(s)) { cell.v = Number(s); return; }
  if (/^(true|false)$/i.test(s)) { cell.v = /^true$/i.test(s); return; }
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(s)) { cell.v = new Date(0); cell.parsedFrom = s; return; } // a date Sheets guessed
  cell.v = s;
}

class Range_ {
  constructor(sh, r, c, nr, nc) { Object.assign(this, { sh, r, c, nr, nc }); }
  each(fn) { const out = []; for (let i = 0; i < this.nr; i++) { const row = []; for (let j = 0; j < this.nc; j++) row.push(fn(this.sh.cell(this.r + i, this.c + j), i, j)); out.push(row); } return out; }
  getValues() { return this.each(x => (x.v === undefined ? '' : x.v)); }
  getDisplayValues() { return this.each(x => (x.v === undefined ? '' : x.v instanceof Date ? 'date' : String(x.v))); }
  getFormulas() { return this.each(x => (x.f ? (x.f.startsWith('=') ? x.f : '=' + x.f) : '')); }
  getNumberFormatsRaw() { return this.each(x => x.fmt); }
  getFormula() { return this.getFormulas()[0][0]; }
  getFormulaR1C1() { const x = this.sh.cell(this.r, this.c); return x.f || ''; }
  setFormulasR1C1(m) { this.each((x, i, j) => { x.f = m[i][j]; x.v = 'calc'; }); this.sh.log.push(['setFormulasR1C1', this.a1()]); return this; }
  setValues(m) {
    if (m.length !== this.nr || m.some(r => r.length !== this.nc)) throw new Error('mock: setValues size mismatch at ' + this.a1());
    this.each((x, i, j) => enter(x, m[i][j], this.a1()));
    this.sh.log.push(['setValues', this.a1()]);
    return this;
  }
  setValue(v) { this.each(x => enter(x, v, this.a1())); this.sh.log.push(['setValue', this.a1()]); return this; }
  setFormulaR1C1(f) { this.each(x => { x.f = f; x.v = 'calc'; }); return this; }
  setNumberFormats(m) { this.each((x, i, j) => { x.fmt = m[i][j]; }); return this; }
  getDataValidations() { return this.each(x => x.rule ? { getAllowInvalid: () => !!x.rule.allowInvalid, getCriteriaType: () => x.rule.type, getCriteriaValues: () => (x.rule.type === 'VALUE_IN_LIST' ? [x.rule.values, true] : x.rule.values || []) } : null); }
  clearContent() { this.each(x => { delete x.v; delete x.f; }); return this; }
  getNumberFormat() { return this.sh.cell(this.r, this.c).fmt || 'General'; }
  getNumberFormats() { return this.each(x => x.fmt || 'General'); }
  setNumberFormat(f) {
    if (this.wholeCols) { for (let j = 0; j < this.nc; j++) this.sh.colFmt[this.c + j] = f; }
    this.each(x => { x.fmt = f; });
    return this;
  }
  setFontWeight() { return this; }
  a1() { const L = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }; return `${this.sh.name}!${L(this.c)}${this.r}:${L(this.c + this.nc - 1)}${this.r + this.nr - 1}`; }
}

class Sheet_ {
  constructor(name, rows = [], opts = {}) {
    this.name = name; this.cells = new Map(); this.maxRows = opts.maxRows || 1000; this.colFmt = {}; this.log = []; this.hidden = false;
    rows.forEach((row, i) => row.forEach((v, j) => { if (v !== '' && v !== undefined && v !== null) this.cell(i + 1, j + 1).v = v; }));
    Object.entries(opts.formulas || {}).forEach(([k, f]) => { const [r, c] = k.split(',').map(Number); const x = this.cell(r, c); x.f = f; x.v = x.v === undefined ? 'calc' : x.v; });
    Object.entries(opts.formats || {}).forEach(([k, f]) => { const [r, c] = k.split(',').map(Number); this.cell(r, c).fmt = f; });
    Object.entries(opts.rules || {}).forEach(([k, rule]) => { const [r, c] = k.split(',').map(Number); this.cell(r, c).rule = rule; });
  }
  cell(r, c) {
    const k = r + ',' + c;
    if (!this.cells.has(k)) this.cells.set(k, this.colFmt[c] ? { fmt: this.colFmt[c] } : {});
    return this.cells.get(k);
  }
  peek(r, c) { return this.cells.get(r + ',' + c) || {}; }
  getName() { return this.name; }
  used() { return [...this.cells.entries()].filter(([, x]) => (x.v !== undefined && x.v !== '') || x.f).map(([k]) => k.split(',').map(Number)); }
  getLastRow() { return this.used().reduce((m, [r]) => Math.max(m, r), 0); }
  getLastColumn() { return this.used().reduce((m, [, c]) => Math.max(m, c), 0); }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(after, n) { this.maxRows += n; }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {
      const m = a.match(/^([A-Z]+):([A-Z]+)$/);
      const n = s => s.split('').reduce((t, ch) => t * 26 + ch.charCodeAt(0) - 64, 0);
      const r = new Range_(this, 1, n(m[1]), this.maxRows, n(m[2]) - n(m[1]) + 1);
      r.wholeCols = true;
      return r;
    }
    if (a < 1 || b < 1) throw new Error('mock: bad range');
    if (a + (c || 1) - 1 > this.maxRows) throw new Error(`mock: rows ${a}..${a + (c || 1) - 1} exceed the sheet's ${this.maxRows} rows`);
    return new Range_(this, a, b, c || 1, d || 1);
  }
  setFrozenRows() { return this; }
  hideSheet() { this.hidden = true; return this; }
  row(r) { const out = []; for (let c = 1; c <= this.getLastColumn(); c++) out.push(this.peek(r, c)); return out; }
}

class Spreadsheet_ {
  constructor(sheets, tz = 'Asia/Kuala_Lumpur') { this.sheets = sheets; this.tz = tz; }
  getName() { return 'Test Kennel Records'; }
  getUrl() { return 'https://docs.google.com/spreadsheets/d/TESTID/edit'; }
  getSpreadsheetTimeZone() { return this.tz; }
  getSheets() { return this.sheets; }
  getSheetByName(n) { return this.sheets.find(s => s.name.toLowerCase() === String(n).toLowerCase()) || null; } // Sheets ignores capitals here
  insertSheet(n) { const s = new Sheet_(n); this.sheets.push(s); return s; }
}

function loadBridge(ss, extra = {}) {
  const props = new Map(Object.entries(extra.props || { APP_KEY: 'k'.repeat(40) }));
  const triggers = [];
  const mail = [];
  const files = new Map();
  const cache = new Map();
  const folders = new Map(); // id → { name, trashed }
  const fileObj = id => {
    const f = files.get(id);
    let i = 0;
    return {
      getId: () => id, getName: () => f.getName(), setDescription: d => { f.desc = d; }, getBlob: () => f,
      isTrashed: () => !!f.trashed, setTrashed: t => { f.trashed = !!t; },
      getParents: () => { const ps = [f.folder].filter(Boolean); return { hasNext: () => i < ps.length, next: () => ({ getId: () => ps[i++] }) }; },
    };
  };
  const folderObj = id => ({
    getId: () => id, isTrashed: () => folders.get(id).trashed, setTrashed: t => { folders.get(id).trashed = !!t; },
    // file IDs are shaped like Drive's, which the apps check before fetching one
    createFile: blob => { const fid = 'drivefile' + String(files.size + 1).padStart(6, '0'); blob.folder = id; files.set(fid, blob); return fileObj(fid); },
  });
  const ctx = {
    console: { log() {}, warn() {} },
    Utilities, JSON, Math, Date, Number, String, Object, Array, RegExp, Error, isFinite, isNaN, parseInt, parseFloat,
    SpreadsheetApp: { openById: id => { if (id !== 'TESTID') throw new Error('wrong id ' + id); return ss; }, flush() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => { if (String(v).length > 9000) throw new Error('property too large'); props.set(k, String(v)); }, setProperties: o => { Object.keys(o).forEach(k => props.set(k, String(o[k]))); }, deleteProperty: k => props.delete(k) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => (cache.has(k) ? cache.get(k) : null), put: (k, v) => { if (String(v).length > 100000) throw new Error('too big'); cache.set(k, String(v)); } }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'owner@example.com' }) },
    MailApp: { sendEmail: m => mail.push(m), getRemainingDailyQuota: () => 100 },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: fn => { const b = { spec: { fn } }; const chain = { timeBased: () => chain, everyDays: n => (b.spec.days = n, chain), atHour: h => (b.spec.hour = h, chain), inTimezone: z => (b.spec.tz = z, chain), create: () => { const t = { getHandlerFunction: () => fn, spec: b.spec }; triggers.push(t); return t; } }; return chain; },
    },
    DriveApp: {
      createFolder: name => { const id = 'folder' + (folders.size + 1); folders.set(id, { name, trashed: false }); return folderObj(id); },
      getFolderById: id => { if (!folders.has(id)) throw new Error('no folder'); return folderObj(id); },
      getFileById: id => { if (!files.has(id)) throw new Error('no file'); return fileObj(id); },
      _addFile: (id, blob, folder) => { blob.folder = folder; files.set(id, blob); },
    },
  };
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'K9AppBridge.gs'), 'utf8').replace("'__SHEET_ID__'", "'TESTID'");
  vm.runInContext(src + '\n;this.__consts = { CHANGE_TAB, PHOTO_TAB, BRIDGE_VERSION };', ctx);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(Object.assign({ key: 'k'.repeat(40) }, body)) } }).getContent());
  return { ctx, post, props, triggers, mail, files, cache, folders };
}

module.exports = { Sheet_, Spreadsheet_, loadBridge, Utilities, DAY };
