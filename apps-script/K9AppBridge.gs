/**
 * K-9 Salon App Bridge (version 2)
 * Lets the K-9 Salon Manager desktop app read and save your kennel records sheet.
 * This script runs in your own Google account. It does not touch your Pet Tools script.
 *
 * ONE-TIME SETUP
 *  1. Copy this script from the app (Settings → Connection → Copy bridge script), so your sheet ID
 *     is filled in below. Paste it into a new Apps Script project and save.
 *  2. Pick "setupAppBridge" in the function menu above and click Run. Approve access.
 *     The execution log at the bottom shows your access key.
 *  3. Deploy → New deployment → gear icon → Web app.
 *     Execute as: Me.  Who has access: Anyone.  Click Deploy and copy the Web app URL.
 *  4. Paste the Web app URL and the access key into K-9 Salon Manager.
 *
 * UPDATING FROM AN OLDER VERSION
 *  Replace all the code with this version and save. Run "setupAppBridge" once (Google asks
 *  for the new permissions: Drive for dog photos, Gmail for reminder emails, triggers for the
 *  daily schedule). Then Deploy → Manage deployments → pencil icon → Version: New version → Deploy.
 *  The web app URL and access key stay the same.
 *
 * TO CHANGE THE ACCESS KEY
 *  Run "resetAppKey", then paste the new key into the app (Settings → Connection).
 */

const SPREADSHEET_ID = '__SHEET_ID__';
const BRIDGE_VERSION = 2;
const CHANGE_TAB = 'App Change Log';
const CHANGE_HEADERS = ['Time', 'Person', 'Action', 'Tab', 'Row', 'Dog', 'Field', 'Before', 'After'];
const CHANGE_LOG_LIMIT = 400;
const PHOTO_TAB = 'App Photos';
const PHOTO_HEADERS = ['Dog', 'File ID', 'Added', 'Added By'];
const PHOTO_FOLDER = 'K-9 Salon Dog Photos';
const MASTER_TAB = 'All Breeds';
const DEFAULT_SETTINGS = {
  checks: { licence: true, healthcheck: true, sterilise: true },
  dueSoonDays: 14,
  breeding: {
    minAgeMonths: 12, maxLittersPer12Months: null, maxLitters: null, maxCsections: null,
    retireAgeYears: null, minMonthsBetweenLitters: null,
  },
  reminders: { enabled: false, hour: 8, extra: '' },
};

/* ---------- setup ---------- */

function setupAppBridge() {
  const props = PropertiesService.getScriptProperties();
  let key = props.getProperty('APP_KEY');
  if (!key) {
    key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40);
    props.setProperty('APP_KEY', key);
  }
  const ss = openSheet_();
  ensureChangeTab_(ss);
  photoFolder_();
  console.log('Connected to "' + ss.getName() + '". Reminder emails left today: ' + MailApp.getRemainingDailyQuota() + '.');
  syncReminderTrigger_(getSettings_().reminders, ss);
  console.log('Your access key: ' + key);
  console.log('Next: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).');
  return key;
}

function resetAppKey() {
  PropertiesService.getScriptProperties().deleteProperty('APP_KEY');
  return setupAppBridge();
}

function openSheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf('__') === 0) {
    throw new Error('This copy of the script has no sheet ID. Copy the script again from the app (Settings → Connection → Copy bridge script).');
  }
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/* ---------- web app entry points ---------- */

function doGet() {
  return out_({ ok: true, bridge: 'K-9 Salon App Bridge', version: BRIDGE_VERSION, message: 'The bridge is running. Paste this URL into K-9 Salon Manager.' });
}

function doPost(e) {
  let p;
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return out_({ ok: false, error: 'bad_json' });
  }
  const key = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  if (!key) return out_({ ok: false, error: 'no_key' });
  if (!p || typeof p.key !== 'string' || !safeEqual_(p.key, key)) return out_({ ok: false, error: 'bad_key' });
  try {
    const ss = openSheet_();
    const who = cleanWho_(p.who);
    switch (p.action) {
      case 'ping': return out_({ ok: true, title: ss.getName(), url: ss.getUrl(), version: BRIDGE_VERSION, tz: ss.getSpreadsheetTimeZone() });
      case 'read': return out_(read_(ss, p.tabs, p.limits));
      case 'save': return out_(saveOne_(ss, p, who));
      case 'batch': return out_(batch_(ss, p, who));
      case 'settings_set': return out_(settingsSet_(ss, p.settings, who));
      case 'photo_upload': return out_(photoUpload_(ss, p, who));
      case 'photo_get': return out_(photoGet_(ss, p));
      case 'digest_test': return out_(digestTest_(ss));
      default: return out_({ ok: false, error: 'bad_action' });
    }
  } catch (err) {
    return out_({ ok: false, error: 'server', message: String((err && err.message) || err) });
  }
}

/* ---------- reading ---------- */

const PROTECTED_TABS = [CHANGE_TAB, PHOTO_TAB];
const SPILLS = /ARRAYFORMULA|^=\s*\{|\b(QUERY|FILTER|SORT|SORTN|UNIQUE|BYROW|BYCOL|MAP|SCAN|MAKEARRAY|SEQUENCE|IMPORTRANGE|FLATTEN|SPLIT|TRANSPOSE)\s*\(/i;

/**
 * read: every requested tab. `limits` can cap how many of the newest rows come back for big tabs.
 */
function read_(ss, wanted, limits) {
  const tz = ss.getSpreadsheetTimeZone();
  const want = Array.isArray(wanted) && wanted.length ? wanted : null;
  const lim = limits && typeof limits === 'object' ? limits : {};
  const tabs = {};
  let photos = {};
  ss.getSheets().forEach(function (sh) {
    const name = sh.getName();
    if (name === PHOTO_TAB) { photos = photoIndex_(sh); return; }
    if (want && want.indexOf(name) < 0) return;
    const n = name === CHANGE_TAB ? CHANGE_LOG_LIMIT : Math.max(0, Math.min(50000, Number(lim[name]) || 0));
    tabs[name] = readTab_(sh, tz, n);
  });
  return {
    ok: true, title: ss.getName(), url: ss.getUrl(), tz: tz, version: BRIDGE_VERSION, tabs: tabs,
    settings: getSettings_(), photos: photos, reminders: { installed: reminderTriggers_().length > 0 },
  };
}

function readTab_(sh, tz, limit) {
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const info = { headers: [], rows: [], formulaCols: [], lastRow: 1, maxRows: sh.getMaxRows() };
  if (lastRow < 1 || lastCol < 1) return info;
  info.headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h); });
  if (lastRow < 2) return info;
  const ci = colInfo_(sh, lastRow, lastCol);
  info.formulaCols = ci.computed;
  const first = limit && lastRow - 1 > limit ? lastRow - limit + 1 : 2;
  const range = sh.getRange(first, 1, lastRow - first + 1, lastCol);
  const values = range.getValues();
  let display = null;
  let last = 1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i].map(function (x, c) {
      const out = cell_(x, tz);
      if (out === TIME_ONLY) {
        if (!display) display = range.getDisplayValues();
        return display[i][c];
      }
      return out;
    });
    const hasData = v.some(function (x, c) { return isData_(x) && ci.computed.indexOf(c) < 0; });
    if (hasData) { info.rows.push({ r: first + i, v: v }); last = first + i; }
  }
  info.lastRow = last;
  return info;
}

const TIME_ONLY = {};

function cell_(x, tz) {
  if (x === '' || x === null || x === undefined) return '';
  if (Object.prototype.toString.call(x) === '[object Date]') {
    if (isNaN(x.getTime())) return '';
    if (Number(Utilities.formatDate(x, tz, 'yyyy')) < 1900) return TIME_ONLY;
    const hm = Utilities.formatDate(x, tz, 'HH:mm');
    const d = Utilities.formatDate(x, tz, 'yyyy-MM-dd');
    return hm === '00:00' ? d : d + ' ' + hm;
  }
  return x;
}

/** Unticked checkboxes (FALSE) and blanks don't count as data. */
function isData_(x) {
  return !(x === '' || x === null || x === undefined || x === false);
}

/**
 * Which columns the sheet calculates:
 *  - formula: most of the last 20 rows hold a formula (a stray formula in one row doesn't count)
 *  - spill: an array formula in the header row or row 2 fills the column
 */
function colInfo_(sh, lastRow, lastCol) {
  const out = { formula: [], spill: [], computed: [] };
  const head = sh.getRange(1, 1, Math.min(2, Math.max(lastRow, 1)), lastCol).getFormulas();
  for (let c = 0; c < lastCol; c++) {
    if (head.some(function (r) { return r[c] && SPILLS.test(r[c]); })) out.spill.push(c);
  }
  if (lastRow >= 2) {
    const n = Math.min(20, lastRow - 1);
    const f = sh.getRange(lastRow - n + 1, 1, n, lastCol).getFormulas();
    for (let c = 0; c < lastCol; c++) {
      if (out.spill.indexOf(c) >= 0) continue;
      let k = 0;
      for (let r = 0; r < f.length; r++) if (f[r][c] && !/^=\s*HYPERLINK\s*\(/i.test(f[r][c])) k++; // links are data, not calculations
      if (k > 0 && k * 2 >= f.length) out.formula.push(c);
    }
  }
  out.computed = out.formula.concat(out.spill).sort(function (a, b) { return a - b; });
  return out;
}

/* ---------- saving ---------- */

function saveOne_(ss, p, who) {
  const res = applyOps_(ss, [{ tab: p.tab, mode: p.mode, row: p.row, changes: p.changes, expect: p.expect, dog: p.dog }], who, p.opId, p.opHash);
  if (!res.ok) return res;
  const r = res.results[0];
  return { ok: true, row: r.row, id: r.id, written: r.written, skipped: r.skipped || [], replay: !!res.replay };
}

function batch_(ss, p, who) {
  const ops = Array.isArray(p.ops) ? p.ops : [];
  if (!ops.length) return { ok: false, error: 'bad_action', message: 'Nothing to save.' };
  if (ops.length > 500) return { ok: false, error: 'server', message: 'Too many rows in one go (500 at most).' };
  return applyOps_(ss, ops, who, p.opId, p.opHash);
}

/**
 * Applies a list of row operations under one lock, all or nothing:
 *  1. every operation is checked first (tabs, columns, the row hasn't changed, dropdown rules);
 *  2. the cells about to change are copied;
 *  3. everything is written; if Sheets refuses part of it, the copied cells are put back.
 * A repeated request with the same opId returns the first result instead of saving twice.
 */
function applyOps_(ss, ops, who, opId, opHash) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, error: 'locked' };
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = opId ? 'op:' + String(opId).slice(0, 80) : '';
    if (cacheKey) {
      const hit = cache.get(cacheKey);
      if (hit) {
        const prev = JSON.parse(hit);
        if (prev.hash !== String(opHash || '')) return { ok: false, error: 'changed_after_save' };
        prev.result.replay = true;
        return prev.result;
      }
    }
    const tz = ss.getSpreadsheetTimeZone();
    const ctx = {};
    const tabCtx = function (name) {
      if (ctx[name]) return ctx[name];
      const sh = ss.getSheetByName(String(name || ''));
      if (!sh) return null;
      const lastCol = Math.max(sh.getLastColumn(), 1);
      const lastRow = sh.getLastRow();
      const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
      ctx[name] = { sh: sh, name: name, lastCol: lastCol, lastRow: lastRow, headers: headers, ci: colInfo_(sh, lastRow, lastCol), newOps: [] };
      return ctx[name];
    };
    const fail = function (error, i, message) { return { ok: false, error: error, index: i, message: message }; };

    // 1 · check every operation before anything is written
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      if (PROTECTED_TABS.indexOf(String(op.tab)) >= 0) return fail('protected', i, 'The app keeps the “' + op.tab + '” tab itself, so it can’t be edited from here.');
      const t = tabCtx(op.tab);
      if (!t) return fail('no_tab', i, 'The “' + op.tab + '” tab is missing from the sheet.');
      const changes = op.changes || [];
      for (let j = 0; j < changes.length; j++) {
        if (colOf_(t.headers, changes[j].h, changes[j].k) < 0) return fail('no_column', i, 'The “' + op.tab + '” tab has no “' + changes[j].h + '” column. If it was renamed, rename it back, then reload the app. Nothing was saved.');
      }
      if (op.mode === 'edit') {
        const row = Number(op.row);
        if (!(row >= 2 && row <= t.lastRow)) return fail('row_moved', i);
        const range = t.sh.getRange(row, 1, 1, t.lastCol);
        const cur = range.getValues()[0];
        const curF = range.getFormulas()[0];
        let display = null;
        const expect = op.expect || [];
        for (let j = 0; j < expect.length; j++) {
          const ex = expect[j];
          const c = colOf_(t.headers, ex.h, ex.k);
          if (c < 0 || curF[c] || t.ci.spill.indexOf(c) >= 0) continue;
          let now = cell_(cur[c], tz);
          if (now === TIME_ONLY) { if (!display) display = range.getDisplayValues()[0]; now = display[c]; }
          if (!same_(now === false ? '' : now, ex.v, ex.kind)) return fail('row_changed', i);
        }
        op._before = cur.map(function (x) { const v = cell_(x, tz); return v === TIME_ONLY ? '' : v; });
        op._formulas = curF;
      } else if (op.mode === 'new') {
        t.newOps.push(op);
      } else {
        return fail('bad_action', i);
      }
    }

    // 2 · plan every write (nothing written yet)
    const results = new Array(ops.length);
    const log = [];
    const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
    const edits = [];   // { t, row, c, val, op, i }
    const blocks = [];  // { t, start, k, matrix, formulasR1C1: {c: f}, fmt: {c: format} }

    ops.forEach(function (op, i) {
      if (op.mode !== 'edit') return;
      const t = ctx[op.tab];
      const row = Number(op.row);
      const skipped = [];
      let written = 0;
      (op.changes || []).forEach(function (ch) {
        const c = colOf_(t.headers, ch.h, ch.k);
        if (op._formulas[c] || t.ci.spill.indexOf(c) >= 0) { skipped.push(ch.h); return; } // never overwrite a formula
        edits.push({ t: t, row: row, c: c, v: ch.v, kind: ch.kind, op: op, i: i, h: ch.h });
        written++;
      });
      results[i] = { row: row, written: written, skipped: skipped };
    });

    Object.keys(ctx).forEach(function (name) {
      const t = ctx[name];
      if (!t.newOps.length) return;
      const start = nextRow_(t.sh, t.lastRow, t.lastCol, t.ci);
      const k = t.newOps.length;
      const idCol = name === MASTER_TAB ? t.headers.indexOf('Animal ID') : -1;
      const seqCols = [];
      t.headers.forEach(function (h, c) { if (/^s\/?n\.?$|^s\/no\.?$/i.test(h) && t.ci.computed.indexOf(c) < 0) seqCols.push(c); });
      const nextId = idCol >= 0 ? nextAnimalId_(t.sh, idCol, t.lastRow) : null;
      const seqNext = {};
      seqCols.forEach(function (c) { seqNext[c] = maxNumber_(t.sh, c, t.lastRow) + 1; });
      const inGrid = Math.max(0, Math.min(k, t.sh.getMaxRows() - start + 1));
      const tgt = inGrid ? t.sh.getRange(start, 1, inGrid, t.lastCol) : null;
      const tgtF = tgt ? tgt.getFormulas() : [];
      const tgtFmt = tgt ? tgt.getNumberFormats() : [];
      const fAt = function (r, c) { return (tgtF[r] && tgtF[r][c]) || ''; };
      const fmtAt = function (r, c) { return String((tgtFmt[r] && tgtFmt[r][c]) || ''); };
      const matrix = [];
      const wantFmt = {};
      t.newOps.forEach(function (op, r) {
        const row = new Array(t.lastCol).fill('');
        const skipped = [];
        let written = 0;
        let assigned = null;
        for (let c = 0; c < t.lastCol; c++) if (fAt(r, c)) row[c] = fAt(r, c); // keep formulas already in place
        (op.changes || []).forEach(function (ch) {
          const c = colOf_(t.headers, ch.h, ch.k);
          if (c === idCol) return; // the bridge always picks the next free ID
          if (fAt(r, c) || t.ci.computed.indexOf(c) >= 0) { if (String(ch.v || '') !== '') skipped.push(ch.h); return; }
          const val = toCell_(ch.v, ch.kind, tz, fmtAt(r, c));
          if (val.v === '') return;
          row[c] = val.v;
          if (val.fmt) (wantFmt[c] = wantFmt[c] || {})[r] = val.fmt;
          written++;
        });
        if (idCol >= 0 && !fAt(r, idCol)) { assigned = nextId.prefix + String(nextId.n).padStart(nextId.width, '0'); nextId.n++; row[idCol] = assigned; (wantFmt[idCol] = wantFmt[idCol] || {})[r] = 'text'; written++; }
        seqCols.forEach(function (c) { if (row[c] === '' && !fAt(r, c)) { row[c] = seqNext[c]++; written++; } });
        matrix.push(row);
        const i = ops.indexOf(op);
        results[i] = { row: start + r, id: assigned, written: written, skipped: skipped };
        log.push([stamp, who, 'Added', name, start + r, dogLabel_(op, assigned), '', '', summary_(t.headers, row, tz)]);
      });
      // copy plain (non-array) formulas from the row above into calculated columns
      const formulasR1C1 = {};
      if (start > 2) {
        const above = t.sh.getRange(start - 1, 1, 1, t.lastCol);
        const aF = above.getFormulas()[0];
        t.ci.formula.forEach(function (c) {
          if (!aF[c] || SPILLS.test(aF[c])) return;
          const src = t.sh.getRange(start - 1, c + 1).getFormulaR1C1();
          if (src) formulasR1C1[c] = src;
        });
      }
      blocks.push({ t: t, start: start, k: k, matrix: matrix, formulasR1C1: formulasR1C1, wantFmt: wantFmt, fmtAt: fmtAt, fAt: fAt });
    });

    // dropdown and checkbox rules that would make Sheets refuse a value
    for (let e = 0; e < edits.length; e++) {
      const x = edits[e];
      const val = toCell_(x.v, x.kind, tz, x.t.sh.getRange(x.row, x.c + 1).getNumberFormat());
      const why = ruleProblem_(x.t.sh.getRange(x.row, x.c + 1).getDataValidations()[0][0], val.v);
      if (why) return fail('invalid', x.i, '“' + x.h + '” in the “' + x.t.name + '” tab ' + why + ' Nothing was saved.');
    }
    for (let b = 0; b < blocks.length; b++) {
      const bl = blocks[b];
      const inGrid = Math.max(0, Math.min(bl.k, bl.t.sh.getMaxRows() - bl.start + 1));
      if (!inGrid) continue;
      const rules = bl.t.sh.getRange(bl.start, 1, inGrid, bl.t.lastCol).getDataValidations();
      for (let r = 0; r < inGrid; r++) for (let c = 0; c < bl.t.lastCol; c++) {
        if (bl.fAt(r, c)) continue;
        const why = ruleProblem_(rules[r] && rules[r][c], bl.matrix[r][c]);
        if (why) return fail('invalid', ops.indexOf(bl.t.newOps[r]), '“' + bl.t.headers[c] + '” in the “' + bl.t.name + '” tab ' + why + ' Nothing was saved.');
      }
    }

    // 3 · write, keeping a copy of every cell so a refusal part-way can be undone
    const undo = [];
    try {
      edits.forEach(function (x) {
        const cell = x.t.sh.getRange(x.row, x.c + 1);
        undo.push({ range: cell, values: cell.getValues(), formulas: cell.getFormulas(), formats: cell.getNumberFormats() });
        writeCell_(cell, x.v, x.kind, tz);
        log.push([stamp, who, 'Edited', x.t.name, x.row, dogLabel_(x.op), x.h, String(x.op._before[x.c] == null ? '' : x.op._before[x.c]), String(x.v == null ? '' : x.v)]);
      });
      blocks.forEach(function (bl) {
        const t = bl.t;
        const end = bl.start + bl.k - 1;
        if (end > t.sh.getMaxRows()) t.sh.insertRowsAfter(t.sh.getMaxRows(), end - t.sh.getMaxRows() + 50);
        const range = t.sh.getRange(bl.start, 1, bl.k, t.lastCol);
        undo.push({ range: range, values: range.getValues(), formulas: range.getFormulas(), formats: range.getNumberFormats() });
        // number formats first, so text stays text and dates show as dates
        Object.keys(bl.wantFmt).forEach(function (key) {
          const c = Number(key);
          Object.keys(bl.wantFmt[c]).forEach(function (rk) {
            const r = Number(rk), kind = bl.wantFmt[c][r], cur = bl.fmtAt(r, c);
            let want = null;
            if (kind === 'text' && cur !== '@') want = '@';
            if (kind === 'date' && !/[dmy]/i.test(cur)) want = 'dd/mm/yyyy';
            if (kind === 'time' && !/h/i.test(cur)) want = 'HH:mm';
            if (want) t.sh.getRange(bl.start + r, c + 1).setNumberFormat(want);
          });
        });
        // write column runs, skipping columns filled by an array formula so it isn't broken
        runs_(t.lastCol, t.ci.spill).forEach(function (run) {
          const part = bl.matrix.map(function (row) { return row.slice(run[0], run[1] + 1); });
          t.sh.getRange(bl.start, run[0] + 1, bl.k, run[1] - run[0] + 1).setValues(part);
        });
        Object.keys(bl.formulasR1C1).forEach(function (key) {
          const c = Number(key);
          for (let r = 0; r < bl.k; r++) if (!bl.fAt(r, c)) t.sh.getRange(bl.start + r, c + 1).setFormulaR1C1(bl.formulasR1C1[c]);
        });
      });
      SpreadsheetApp.flush();
    } catch (err) {
      let restored = true;
      for (let u = undo.length - 1; u >= 0; u--) {
        try {
          const x = undo[u];
          x.range.setNumberFormats(x.formats);
          x.range.setValues(x.values.map(function (row, r) { return row.map(function (v, c) { return x.formulas[r][c] || v; }); }));
        } catch (e2) { restored = false; }
      }
      SpreadsheetApp.flush();
      return { ok: false, error: 'refused', rolledBack: restored, message: 'Google Sheets refused part of this save: ' + String((err && err.message) || err) + (restored ? ' Nothing was saved.' : ' Some cells may have changed. Check the sheet before saving again.') };
    }

    if (log.length) appendLog_(ss, log);
    const result = { ok: true, results: results, written: results.reduce(function (n, r) { return n + ((r && r.written) || 0); }, 0) };
    if (cacheKey) { try { cache.put(cacheKey, JSON.stringify({ hash: String(opHash || ''), result: result }), 21600); } catch (e) { /* result too large to remember */ } }
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** Runs of column indexes [from, to] that skip the given columns. */
function runs_(lastCol, skip) {
  const out = [];
  let from = -1;
  for (let c = 0; c <= lastCol; c++) {
    const ok = c < lastCol && skip.indexOf(c) < 0;
    if (ok && from < 0) from = c;
    if (!ok && from >= 0) { out.push([from, c - 1]); from = -1; }
  }
  return out;
}

/** Why a value would break the cell's dropdown or checkbox rule, or '' if it's fine. */
function ruleProblem_(rule, v) {
  if (!rule || v === '' || v === null || v === undefined) return '';
  try {
    if (rule.getAllowInvalid()) return '';
    const type = String(rule.getCriteriaType());
    const args = rule.getCriteriaValues() || [];
    const text = String(v).replace(/^'/, '');
    if (type === 'VALUE_IN_LIST') {
      const list = (args[0] || []).map(String);
      return list.indexOf(text) >= 0 ? '' : 'only accepts: ' + list.slice(0, 12).join(', ') + '.';
    }
    if (type === 'VALUE_IN_RANGE' && args[0] && args[0].getDisplayValues) {
      const list = [].concat.apply([], args[0].getDisplayValues()).map(String).filter(String);
      return list.indexOf(text) >= 0 ? '' : 'only accepts: ' + list.slice(0, 12).join(', ') + '.';
    }
    if (type === 'CHECKBOX') {
      if (!args.length) return typeof v === 'boolean' ? '' : 'is a tick box, so it only accepts ticked or unticked.';
      return args.map(String).indexOf(text) >= 0 ? '' : 'only accepts ' + args.map(String).join(' or ') + '.';
    }
  } catch (e) { /* unknown rule: let Sheets decide, and undo if it refuses */ }
  return '';
}

function colOf_(headers, h, k) {
  let seen = 0;
  const want = String(h).trim();
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] === want) {
      if (seen === (k || 0)) return i;
      seen++;
    }
  }
  return -1;
}

/** The first row after the last real data, reading backwards in chunks so big tabs stay quick. */
function nextRow_(sh, lastRow, lastCol, ci) {
  const skip = ci.computed;
  let end = lastRow;
  while (end >= 2) {
    const n = Math.min(500, end - 1);
    const v = sh.getRange(end - n + 1, 1, n, lastCol).getValues();
    for (let r = v.length - 1; r >= 0; r--) {
      for (let c = 0; c < lastCol; c++) {
        if (skip.indexOf(c) < 0 && isData_(v[r][c])) return end - n + 1 + r + 1;
      }
    }
    end -= n;
  }
  return 2;
}

function nextAnimalId_(sh, col, lastRow) {
  const out = { prefix: 'A', width: 3, n: 1 };
  if (lastRow < 2) return out;
  const v = sh.getRange(2, col + 1, lastRow - 1, 1).getValues();
  let max = 0;
  v.forEach(function (r) {
    const m = String(r[0]).trim().match(/^([A-Za-z]*)(\d+)$/);
    if (m && Number(m[2]) >= max) { max = Number(m[2]); out.prefix = m[1] || 'A'; out.width = m[2].length; }
  });
  out.n = max + 1;
  return out;
}

function maxNumber_(sh, col, lastRow) {
  if (lastRow < 2) return 0;
  const v = sh.getRange(2, col + 1, lastRow - 1, 1).getValues();
  let max = 0;
  v.forEach(function (r) { const n = Number(r[0]); if (r[0] !== '' && r[0] !== false && r[0] !== true && isFinite(n) && n > max) max = n; });
  return Math.floor(max);
}

/**
 * Turns an app value into a cell value, plus the number format it needs.
 * Text that Sheets would otherwise read as a number, date or formula gets a leading apostrophe,
 * unless the cell is already formatted as plain text (where the apostrophe would show).
 */
function toCell_(v, kind, tz, cellFormat) {
  if (v === '' || v === null || v === undefined) return { v: '' };
  v = String(v);
  if (kind === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return { v: Utilities.parseDate(v, tz, 'yyyy-MM-dd'), fmt: 'date' };
  if (kind === 'time') {
    const t = v.match(/^(\d{1,2}):(\d{2})$/);
    if (t) return { v: (Number(t[1]) * 60 + Number(t[2])) / 1440, fmt: 'time' };
  }
  if (kind === 'bool') return { v: v === 'TRUE' };
  if (kind === 'number' && v.trim() !== '' && !isNaN(Number(v))) return { v: Number(v) };
  if (kind === 'chip') return { v: v, fmt: 'text' };
  if (String(cellFormat || '') === '@') return { v: v };
  if (/^[=+\-@']/.test(v) || /^\d{9,}$/.test(v) || /^\d{1,2}[\/.\-]\d{1,2}([\/.\-]\d{2,4})?$/.test(v) || /^(true|false)$/i.test(v) || /^0\d+$/.test(v)) return { v: "'" + v };
  return { v: v };
}

function writeCell_(cell, v, kind, tz) {
  if (v === '' || v === null || v === undefined) { cell.clearContent(); return; }
  const fmt = cell.getNumberFormat();
  const val = toCell_(v, kind, tz, fmt);
  if (val.fmt === 'date' && !/[dmy]/i.test(fmt)) cell.setNumberFormat('dd/mm/yyyy');
  if (val.fmt === 'time' && !/h/i.test(fmt)) cell.setNumberFormat('HH:mm');
  if (val.fmt === 'text') { if (fmt !== '@') cell.setNumberFormat('@'); cell.setValue(String(v)); return; }
  cell.setValue(val.v);
}

/* ---------- change log ---------- */

function ensureChangeTab_(ss) {
  let sh = ss.getSheetByName(CHANGE_TAB);
  if (sh) return sh;
  sh = ss.insertSheet(CHANGE_TAB);
  sh.getRange(1, 1, 1, CHANGE_HEADERS.length).setValues([CHANGE_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.getRange('B:D').setNumberFormat('@');
  sh.getRange('F:I').setNumberFormat('@');
  return sh;
}

function appendLog_(ss, lines) {
  try {
    const sh = ensureChangeTab_(ss);
    const start = sh.getLastRow() + 1;
    if (start + lines.length - 1 > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), lines.length + 100);
    const fmts = sh.getRange(start, 1, 1, CHANGE_HEADERS.length).getNumberFormats()[0];
    const rows = lines.map(function (l) {
      return l.map(function (x, i) {
        if (i === 4) return x;
        const s = String(x == null ? '' : x).replace(/^'/, '').slice(0, 500);
        return fmts[i] !== '@' && /^[=+\-@']|^\d{9,}$|^0\d+$/.test(s) ? "'" + s : s;
      });
    });
    sh.getRange(start, 1, rows.length, CHANGE_HEADERS.length).setValues(rows);
  } catch (err) {
    console.warn('Could not write to the change log: ' + err);
  }
}

function dogLabel_(op, id) {
  const d = String(op.dog || '').slice(0, 120);
  if (d) return d;
  const chip = (op.changes || []).filter(function (c) { return c.kind === 'chip' && c.v; })[0];
  return chip ? String(chip.v) : (id || '');
}

function summary_(headers, row, tz) {
  const parts = [];
  for (let c = 0; c < headers.length && parts.length < 8; c++) {
    let v = row[c];
    if (v === '' || v === null || v === undefined) continue;
    if (Object.prototype.toString.call(v) === '[object Date]') v = Utilities.formatDate(v, tz || 'GMT', 'yyyy-MM-dd');
    else if (typeof v === 'string' && v.charAt(0) === '=') continue;
    v = String(v).replace(/^'/, '');
    parts.push(headers[c] + ': ' + v);
  }
  return parts.join(' · ').slice(0, 500);
}

function cleanWho_(who) {
  const w = String(who || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 60);
  return w || 'K-9 Salon app';
}

/* ---------- shared settings ---------- */

function getSettings_() {
  let saved = {};
  try { saved = JSON.parse(PropertiesService.getScriptProperties().getProperty('APP_SETTINGS') || '{}'); } catch (e) { saved = {}; }
  return merge_(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), saved);
}

function merge_(base, extra) {
  Object.keys(extra || {}).forEach(function (k) {
    if (!(k in base)) return;
    const b = base[k], x = extra[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && x && typeof x === 'object') merge_(b, x);
    else base[k] = x;
  });
  return base;
}

function cleanSettings_(s) {
  const num = function (x, lo, hi) { if (x === null || x === '' || x === undefined) return null; const n = Number(x); return isFinite(n) && n >= lo && n <= hi ? n : null; };
  const out = getSettings_();
  if (s.checks) Object.keys(out.checks).forEach(function (k) { if (k in s.checks) out.checks[k] = !!s.checks[k]; });
  if ('dueSoonDays' in s) out.dueSoonDays = num(s.dueSoonDays, 1, 90) || 14;
  if (s.breeding) {
    const b = s.breeding;
    if ('minAgeMonths' in b) out.breeding.minAgeMonths = num(b.minAgeMonths, 0, 60);
    if ('maxLittersPer12Months' in b) out.breeding.maxLittersPer12Months = num(b.maxLittersPer12Months, 1, 6);
    if ('maxLitters' in b) out.breeding.maxLitters = num(b.maxLitters, 1, 20);
    if ('maxCsections' in b) out.breeding.maxCsections = num(b.maxCsections, 0, 10);
    if ('retireAgeYears' in b) out.breeding.retireAgeYears = num(b.retireAgeYears, 1, 20);
    if ('minMonthsBetweenLitters' in b) out.breeding.minMonthsBetweenLitters = num(b.minMonthsBetweenLitters, 1, 24);
  }
  if (s.reminders) {
    const r = s.reminders;
    if ('enabled' in r) out.reminders.enabled = !!r.enabled;
    if ('hour' in r) out.reminders.hour = num(r.hour, 0, 23) === null ? 8 : num(r.hour, 0, 23);
    if ('extra' in r) out.reminders.extra = String(r.extra || '').split(/[,;\s]+/).filter(isEmail_).slice(0, 5).join(', ');
  }
  return out;
}

function settingsSet_(ss, patch, who) {
  if (!patch || typeof patch !== 'object') return { ok: false, error: 'bad_action' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'locked' };
  try {
    const before = getSettings_();
    const next = cleanSettings_(patch);
    PropertiesService.getScriptProperties().setProperty('APP_SETTINGS', JSON.stringify(next));
    let reminderError = '';
    if (JSON.stringify(before.reminders) !== JSON.stringify(next.reminders)) {
      try { syncReminderTrigger_(next.reminders, ss); } catch (err) { reminderError = String((err && err.message) || err); }
    }
    const tz = ss.getSpreadsheetTimeZone();
    appendLog_(ss, [[Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'), who, 'Settings', '', '', '', 'App settings', '', settingsSummary_(next)]]);
    return { ok: true, settings: next, reminders: { installed: reminderTriggers_().length > 0, error: reminderError } };
  } finally {
    lock.releaseLock();
  }
}

function settingsSummary_(s) {
  const b = s.breeding;
  return ['Licence check ' + (s.checks.licence ? 'on' : 'off'), 'Annual check ' + (s.checks.healthcheck ? 'on' : 'off'),
    'First mating ' + (b.minAgeMonths == null ? 'any age' : b.minAgeMonths + ' mo'),
    'Reminders ' + (s.reminders.enabled ? 'at ' + s.reminders.hour + ':00' : 'off')].join(' · ');
}

/* ---------- photos ---------- */

function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) { /* make a new one */ }
  }
  const folder = DriveApp.createFolder(PHOTO_FOLDER);
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function photoTab_(ss) {
  let sh = ss.getSheetByName(PHOTO_TAB);
  if (sh) return sh;
  sh = ss.insertSheet(PHOTO_TAB);
  sh.getRange(1, 1, 1, PHOTO_HEADERS.length).setValues([PHOTO_HEADERS]).setFontWeight('bold');
  sh.getRange('A:D').setNumberFormat('@');
  sh.setFrozenRows(1);
  try { sh.hideSheet(); } catch (e) { /* stays visible */ }
  return sh;
}

function photoIndex_(sh) {
  const out = {};
  const last = sh.getLastRow();
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) {
    const k = String(r[0]).trim(), id = String(r[1]).trim();
    if (k && id) out[k] = { id: id, at: String(r[2]) };
  });
  return out;
}

function photoUpload_(ss, p, who) {
  const key = String(p.dogKey || '').trim();
  if (!/^(\d{6,20}|id:[A-Za-z0-9-]{1,20})$/.test(key)) return { ok: false, error: 'server', message: 'This dog has no microchip or animal ID to file the photo under.' };
  const mime = String(p.mime || '');
  if (!/^image\/(jpeg|png|webp)$/.test(mime)) return { ok: false, error: 'server', message: 'Photos must be JPEG, PNG or WebP.' };
  const data = String(p.data || '');
  if (!data || data.length > 11000000) return { ok: false, error: 'server', message: 'The photo is too large (8 MB at most).' };
  const tz = ss.getSpreadsheetTimeZone();
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm');
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  const label = String(p.dogName || '').replace(/[^\w .'-]/g, '').slice(0, 40);
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mime, key.replace(':', '-') + (label ? ' ' + label : '') + ' ' + stamp.replace(/[: ]/g, '-') + '.' + ext);
  const file = photoFolder_().createFile(blob);
  file.setDescription('K-9 Salon photo for ' + key);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return { ok: false, error: 'locked' };
  try {
    const sh = photoTab_(ss);
    const last = sh.getLastRow();
    let row = 0;
    if (last >= 2) {
      const keys = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < keys.length; i++) if (String(keys[i][0]).trim() === key) { row = i + 2; break; }
    }
    if (!row) row = last + 1;
    sh.getRange(row, 1, 1, 4).setValues([[key, file.getId(), stamp, who]]);
    appendLog_(ss, [[stamp, who, 'Photo', PHOTO_TAB, row, String(p.dogName || key), 'Photo', '', file.getName()]]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, id: file.getId(), at: stamp };
}

function photoGet_(ss, p) {
  const id = String(p.id || '');
  const sh = ss.getSheetByName(PHOTO_TAB);
  if (!id || !sh) return { ok: false, error: 'server', message: 'Photo not found.' };
  const idx = photoIndex_(sh);
  const known = Object.keys(idx).some(function (k) { return idx[k].id === id; });
  if (!known) return { ok: false, error: 'server', message: 'Photo not found.' };
  const file = DriveApp.getFileById(id);
  const folderId = PropertiesService.getScriptProperties().getProperty('PHOTO_FOLDER_ID');
  let inFolder = false;
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
  const blob = file.getBlob();
  if (!inFolder || !/^image\/(jpeg|png|webp)$/.test(blob.getContentType())) return { ok: false, error: 'server', message: 'Photo not found.' };
  return { ok: true, mime: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ---------- daily reminder email ---------- */

function reminderTriggers_() {
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'sendDailyDigest'; });
}

function syncReminderTrigger_(r, ss) {
  reminderTriggers_().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  if (!r || !r.enabled) return;
  ScriptApp.newTrigger('sendDailyDigest').timeBased().everyDays(1).atHour(Number(r.hour) || 0).inTimezone(ss.getSpreadsheetTimeZone()).create();
}

function sendDailyDigest() {
  const s = getSettings_();
  if (!s.reminders.enabled) return;
  const ss = openSheet_();
  const d = digestItems_(ss, s);
  if (!d.overdue.length && !d.soon.length) return;
  sendDigest_(ss, s, d, false);
}

function digestTest_(ss) {
  const s = getSettings_();
  const d = digestItems_(ss, s);
  const to = sendDigest_(ss, s, d, true);
  return { ok: true, to: to, overdue: d.overdue.length, soon: d.soon.length };
}

function sendDigest_(ss, s, d, test) {
  const to = [Session.getEffectiveUser().getEmail()].concat(String(s.reminders.extra || '').split(/[,;\s]+/)).filter(isEmail_);
  const uniq = to.filter(function (x, i) { return to.indexOf(x) === i; });
  const subject = 'K-9 Salon: ' + (d.overdue.length ? d.overdue.length + ' overdue, ' : '') + d.soon.length + ' due in the next 7 days' + (test ? ' (test)' : '');
  const section = function (title, items) {
    if (!items.length) return '';
    const shown = items.slice(0, 60);
    return '<h3 style="font-family:Segoe UI,Arial,sans-serif;margin:18px 0 6px">' + esc_(title) + '</h3><table style="border-collapse:collapse;font-family:Segoe UI,Arial,sans-serif;font-size:14px">' +
      shown.map(function (it) {
        return '<tr><td style="padding:4px 14px 4px 0;color:#555;white-space:nowrap">' + esc_(it.when) + '</td><td style="padding:4px 0"><b>' + esc_(it.what) + '</b> · ' + esc_(it.who) + '</td></tr>';
      }).join('') + '</table>' + (items.length > shown.length ? '<p style="font-family:Segoe UI,Arial,sans-serif;color:#555">…and ' + (items.length - shown.length) + ' more. Open K-9 Salon Manager for the full list.</p>' : '');
  };
  const html = '<div style="max-width:640px">' + (test ? '<p style="font-family:Segoe UI,Arial,sans-serif;color:#555">This is a test of your daily reminder email.</p>' : '') +
    section('Overdue', d.overdue) + section('Due in the next 7 days', d.soon) +
    (!d.overdue.length && !d.soon.length ? '<p style="font-family:Segoe UI,Arial,sans-serif">Nothing is overdue or due in the next 7 days.</p>' : '') +
    '<p style="font-family:Segoe UI,Arial,sans-serif;color:#777;font-size:12px;margin-top:22px">Sent by the K-9 Salon App Bridge. Turn these emails off in K-9 Salon Manager → Settings → Reminders.</p></div>';
  const text = d.overdue.concat(d.soon).map(function (it) { return it.when + '  ' + it.what + ' · ' + it.who; }).join('\n') || 'Nothing is overdue or due in the next 7 days.';
  MailApp.sendEmail({ to: uniq.join(','), subject: subject, htmlBody: html, body: text, name: 'K-9 Salon Manager' });
  return uniq;
}

function digestItems_(ss, s) {
  const tz = ss.getSpreadsheetTimeZone();
  const today = dayIndex_(new Date(), tz);
  const out = { overdue: [], soon: [] };
  const add = function (date, what, who) {
    if (!date) return;
    const n = dayIndex_(date, tz) - today;
    const item = { n: n, when: n < 0 ? (-n) + ' day' + (n === -1 ? '' : 's') + ' late' : n === 0 ? 'Today' : Utilities.formatDate(date, tz, 'EEE d MMM'), what: what, who: who };
    if (n < 0) out.overdue.push(item); else if (n <= 7) out.soon.push(item);
  };
  const rows = function (name) {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return { h: [], v: [] };
    const all = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    return { h: all[0].map(function (x) { return String(x).trim(); }), v: all.slice(1) };
  };
  const get = function (t, r, h) { const c = t.h.indexOf(h); return c < 0 ? '' : r[c]; };
  const chipOf = function (x) { return String(x || '').replace(/\D/g, ''); };

  const dogs = {};
  const ab = rows(MASTER_TAB);
  ab.v.forEach(function (r) {
    const chip = chipOf(get(ab, r, 'Microchip No.'));
    if (!/^active/i.test(String(get(ab, r, 'Status')))) return;
    const name = String(get(ab, r, 'Name') || '') || 'Unnamed ' + String(get(ab, r, 'Breed') || 'dog').toLowerCase();
    const d = { name: name, label: name + (get(ab, r, 'Animal ID') ? ' (' + get(ab, r, 'Animal ID') + ')' : '') };
    if (chip) dogs[chip] = d;
    add(toDate_(get(ab, r, 'Licence Expiry'), tz), 'Licence expiry', d.label);
  });
  const latestDue = function (tab, field) {
    const t = rows(tab), best = {};
    t.v.forEach(function (r) {
      const chip = chipOf(get(t, r, 'Microchip No.'));
      const due = toDate_(get(t, r, field), tz);
      if (chip && due && (!best[chip] || due > best[chip])) best[chip] = due;
    });
    return best;
  };
  const vac = latestDue('Vaccinations', 'Next Due Date');
  Object.keys(vac).forEach(function (chip) { if (dogs[chip]) add(vac[chip], 'Vaccination', dogs[chip].label); });
  const par = latestDue('Parasite Treatments', 'Next Due Date');
  Object.keys(par).forEach(function (chip) { if (dogs[chip]) add(par[chip], 'Parasite treatment', dogs[chip].label); });

  const heat = rows('Heat Cycles'), lastHeat = {};
  heat.v.forEach(function (r) {
    const chip = chipOf(get(heat, r, 'Microchip No.'));
    const onset = toDate_(get(heat, r, 'Onset Date (Proestrus)'), tz);
    if (chip && onset && (!lastHeat[chip] || onset > lastHeat[chip].onset)) lastHeat[chip] = { onset: onset, next: toDate_(get(heat, r, 'Est. Next Heat'), tz) };
  });
  Object.keys(lastHeat).forEach(function (chip) { if (dogs[chip] && lastHeat[chip].next) add(lastHeat[chip].next, 'Heat expected', dogs[chip].label); });

  const lit = rows('Puppies Bred In-House'), lastLitter = {};
  lit.v.forEach(function (r) {
    const chip = chipOf(get(lit, r, 'Dam Microchip'));
    const dob = toDate_(get(lit, r, 'Litter DOB'), tz);
    if (chip && dob && (!lastLitter[chip] || dob > lastLitter[chip])) lastLitter[chip] = dob;
  });
  const mat = rows('Mating Records'), lastMating = {};
  mat.v.forEach(function (r) {
    const chip = chipOf(get(mat, r, 'Dam Microchip'));
    const md = toDate_(get(mat, r, 'Date of Mating'), tz);
    if (chip && md && (!lastMating[chip] || md > lastMating[chip].date)) lastMating[chip] = { date: md, failed: /^(no|n|false|unsuccessful|failed)$/i.test(String(get(mat, r, 'Successful')).trim()), due: toDate_(get(mat, r, 'Expected Whelp Date'), tz) };
  });
  Object.keys(lastMating).forEach(function (chip) {
    const m = lastMating[chip];
    if (!dogs[chip] || m.failed) return;
    if (lastLitter[chip] && lastLitter[chip] >= m.date) return;
    const due = m.due || new Date(m.date.getTime() + 63 * 864e5);
    if (dayIndex_(due, tz) - today >= -10) add(due, 'Expected whelping', dogs[chip].label);
  });

  const tr = rows('Staff Training');
  tr.v.forEach(function (r) { add(toDate_(get(tr, r, 'Refresher Due (3yr)'), tz), 'Training refresher', String(get(tr, r, 'Staff Name') || '') + ' · ' + String(get(tr, r, 'Course Name') || '')); });

  out.overdue.sort(function (a, b) { return a.n - b.n; });
  out.soon.sort(function (a, b) { return a.n - b.n; });
  return out;
}

function toDate_(x, tz) {
  if (x === '' || x === null || x === undefined) return null;
  if (Object.prototype.toString.call(x) === '[object Date]') return isNaN(x.getTime()) ? null : x;
  const s = String(x).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return Utilities.parseDate(m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0'), tz, 'yyyy-MM-dd');
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if (m) return Utilities.parseDate(m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'), tz, 'yyyy-MM-dd');
  return null;
}

function dayIndex_(d, tz) {
  const p = Utilities.formatDate(d, tz, 'yyyy-MM-dd').split('-').map(Number);
  return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / 864e5);
}

/* ---------- helpers ---------- */

function same_(cur, expected, kind) {
  const a = canon_(cur);
  const b = canon_(expected);
  if (a === b) return true;
  if (kind === 'date' || kind === 'datetime') {
    const da = isoDay_(a);
    return !!da && da === isoDay_(b);
  }
  if (a !== '' && b !== '' && !isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) === Number(b);
  if (kind === 'chip') return a.replace(/\D/g, '') === b.replace(/\D/g, '');
  return false;
}

function canon_(x) {
  if (x === true) return 'TRUE';
  if (x === false) return 'FALSE';
  if (x === null || x === undefined) return '';
  return String(x).trim();
}

function isoDay_(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  if (/^\d+(\.\d+)?$/.test(s)) return new Date(Math.round((Number(s) - 25569) * 86400000)).toISOString().slice(0, 10);
  return '';
}

function isEmail_(s) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(s || '').trim());
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
