'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Sheet_, Spreadsheet_, loadBridge, Utilities } = require('./gas-mock');

const TZ = 'Asia/Kuala_Lumpur';
const D = s => Utilities.parseDate(s, TZ, 'yyyy-MM-dd');
const iso = d => Utilities.formatDate(d, TZ, 'yyyy-MM-dd');
const today = () => iso(new Date());
const addDays = (s, n) => iso(new Date(D(s).getTime() + n * 864e5));

const AB = ['Animal ID', 'Microchip No.', 'Name', 'Breed', 'Colour', 'Sex', 'Date of Birth', 'Age', 'Sterilised', 'Premise', 'Kennel No.', 'Status', 'Remarks', 'Vaccination Status', 'Next Vaccination Date', 'Source', 'Dam Microchip', 'Sire Microchip', 'PALS Licence No.', 'Licence Expiry'];
const VAC = ['Microchip No.', 'Dog Name', 'Date Given', 'Vaccine Type', 'Batch No.', 'Administering Vet', 'Vet Licence No.', 'Clinic', 'Next Due Date', 'Certificate No.', 'Signature Date'];
const DHM = ['S/N', 'Date', 'Microchip No.', 'General', 'Skin/Eyes/Ears/Oral/Nasal', 'Limbs', 'Heart/Lungs', 'Fit for Breeding', 'Remarks', 'Vaccine Label'];
const MAT = ['Date of Mating', 'Dam Microchip', 'Dam Name', 'Sire #1 Microchip', 'Sire #1 Name', 'Sire #2 Microchip', 'Sire #2 Name', 'Successful', 'Expected Whelp Date', 'Notes'];
const LIT = ['Dam Microchip', 'Dam Breed', 'Dam DOB', 'Dam Source', 'Sire Microchip', 'Sire Breed', 'Litter DOB', 'Delivery Method', 'Litter No.', 'No. of Puppies', 'Puppy Microchips', 'Sex Breakdown', 'Colours', 'Date Out', 'Status', 'Notes'];

function fixture() {
  const dogs = [
    ['A001', '999000000000101', 'Biscuit', 'MALTIPOO', 'APRICOT', 'F', D('2022-06-23'), '', '', 'Test Kennel - Breeding', 1, 'Active'],
    ['A002', '999000000000102', 'Pepper', 'BICHON FRISE', 'WHITE', 'M', D('2022-11-01'), '', '', 'Test Kennel - Breeding', 1, 'Active'],
    ['A009', '999000000000103', 'Toffee', 'MALTIPOO', 'CREAM', 'F', D('2021-01-05'), '', '', 'Test Kennel - Breeding', 2, 'Active'],
  ];
  const formulas = {}, formats = {};
  dogs.forEach((_, i) => { formulas[`${i + 2},8`] = '=IF(R[0]C[-1]="","",DATEDIF(R[0]C[-1],TODAY(),"Y"))'; formats[`${i + 2},2`] = '@'; formats[`${i + 2},7`] = 'dd/mm/yyyy'; });
  const ab = new Sheet_('All Breeds', [AB, ...dogs], { formulas, formats });
  const vac = new Sheet_('Vaccinations', [VAC, ['999000000000101', 'Biscuit', D('2025-10-10'), 'DHPPi', '', '', '', 'Clinic A', D(addDays(today(), -3))]]);
  const dhm = new Sheet_('Daily Health Monitoring', [DHM, [7, D('2026-10-01'), '999000000000101', 'Normal']]);
  const mat = new Sheet_('Mating Records', [MAT, [D(addDays(today(), -60)), '999000000000103', 'Toffee', '999000000000102', 'Pepper', '', '', '', D(addDays(today(), 3))]]);
  const lit = new Sheet_('Puppies Bred In-House', [LIT]);
  const ss = new Spreadsheet_([ab, vac, dhm, mat, lit]);
  return { ss, ab, vac, dhm, mat, lit };
}

test('rejects a wrong key and unknown actions', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  assert.equal(b.post({ key: 'nope', action: 'ping' }).error, 'bad_key');
  assert.equal(b.post({ action: 'dance' }).error, 'bad_action');
  const ping = b.post({ action: 'ping' });
  assert.equal(ping.ok, true);
  assert.equal(ping.version, 4);
});

test('read returns rows, formula columns, default settings and no photos', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  const r = b.post({ action: 'read', tabs: ['All Breeds', 'Vaccinations'] });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.tabs).sort(), ['All Breeds', 'Vaccinations']);
  const t = r.tabs['All Breeds'];
  assert.deepEqual(t.formulaCols, [7]);
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[0].v[6], '2022-06-23');
  assert.equal(r.settings.checks.licence, true);
  assert.equal(r.settings.breeding.minAgeMonths, 12);
  assert.deepEqual(r.photos, {});
});

test('a new dog gets the next animal ID, a text microchip, a real date and the Age formula', () => {
  const { ss, ab } = fixture();
  const b = loadBridge(ss);
  const res = b.post({
    action: 'save', tab: 'All Breeds', mode: 'new', who: 'Austin', changes: [
      { h: 'Animal ID', k: 0, v: 'A999', kind: 'text' },
      { h: 'Microchip No.', k: 0, v: '999000000000199', kind: 'chip' },
      { h: 'Name', k: 0, v: 'Pip', kind: 'text' },
      { h: 'Date of Birth', k: 0, v: '2026-06-01', kind: 'date' },
      { h: 'Kennel No.', k: 0, v: '3', kind: 'text' },
      { h: 'Remarks', k: 0, v: '=HYPERLINK("x")', kind: 'long' },
    ],
  });
  assert.equal(res.ok, true);
  assert.equal(res.row, 5);
  assert.equal(res.id, 'A010', 'IDs continue from the highest existing number, ignoring the one the app sent');
  assert.equal(ab.peek(5, 1).v, 'A010');
  assert.equal(ab.peek(5, 2).v, '999000000000199');
  assert.equal(typeof ab.peek(5, 2).v, 'string');
  assert.ok(ab.peek(5, 7).v instanceof Date);
  assert.equal(iso(ab.peek(5, 7).v), '2026-06-01');
  assert.match(ab.peek(5, 7).fmt, /d/);
  assert.equal(ab.peek(5, 8).f, '=IF(R[0]C[-1]="","",DATEDIF(R[0]C[-1],TODAY(),"Y"))');
  assert.equal(ab.peek(5, 11).v, 3);
  assert.equal(ab.peek(5, 13).v, '=HYPERLINK("x")', 'text that looks like a formula stays text');
  assert.equal(ab.peek(5, 13).f, undefined);
  const log = ss.getSheetByName('App Change Log');
  assert.ok(log, 'change log tab is created');
  assert.equal(log.peek(2, 2).v, 'Austin');
  assert.equal(log.peek(2, 3).v, 'Added');
  assert.match(String(log.peek(2, 9).v), /Name: Pip/);
});

test('an edit writes only changed cells and refuses when the row changed meanwhile', () => {
  const { ss, ab } = fixture();
  const b = loadBridge(ss);
  const ok = b.post({
    action: 'save', tab: 'All Breeds', mode: 'edit', row: 2, who: 'Austin',
    changes: [{ h: 'Kennel No.', k: 0, v: '4', kind: 'text' }],
    expect: [{ h: 'Name', k: 0, v: 'Biscuit', kind: 'text' }, { h: 'Date of Birth', k: 0, v: '2022-06-23', kind: 'date' }, { h: 'Kennel No.', k: 0, v: '1', kind: 'text' }],
  });
  assert.equal(ok.ok, true);
  assert.equal(ab.peek(2, 11).v, 4);
  const log = ss.getSheetByName('App Change Log');
  assert.equal(log.peek(2, 7).v, 'Kennel No.');
  assert.equal(log.peek(2, 8).v, '1');
  assert.equal(log.peek(2, 9).v, '4');

  const stale = b.post({ action: 'save', tab: 'All Breeds', mode: 'edit', row: 2, changes: [{ h: 'Name', k: 0, v: 'Amy', kind: 'text' }], expect: [{ h: 'Kennel No.', k: 0, v: '1', kind: 'text' }] });
  assert.equal(stale.ok, false);
  assert.equal(stale.error, 'row_changed');
  assert.equal(ab.peek(2, 3).v, 'Biscuit');
});

test('a batch writes many rows in one block, numbers S/N and keeps the order of results', () => {
  const { ss, vac, dhm } = fixture();
  const b = loadBridge(ss);
  const chips = ['999000000000101', '999000000000102', '999000000000103'];
  const ops = chips.map(c => ({ tab: 'Vaccinations', mode: 'new', dog: c, changes: [
    { h: 'Microchip No.', k: 0, v: c, kind: 'chip' }, { h: 'Date Given', k: 0, v: '2026-10-17', kind: 'date' },
    { h: 'Vaccine Type', k: 0, v: 'Rabies', kind: 'text' }, { h: 'Next Due Date', k: 0, v: '2027-10-17', kind: 'date' }] }));
  ops.splice(1, 0, { tab: 'Daily Health Monitoring', mode: 'new', changes: [{ h: 'Date', k: 0, v: '2026-10-17', kind: 'date' }, { h: 'Microchip No.', k: 0, v: chips[0], kind: 'chip' }, { h: 'General', k: 0, v: 'Normal', kind: 'text' }] });
  ops.push({ tab: 'Daily Health Monitoring', mode: 'new', changes: [{ h: 'Date', k: 0, v: '2026-10-17', kind: 'date' }, { h: 'Microchip No.', k: 0, v: chips[1], kind: 'chip' }] });
  const res = b.post({ action: 'batch', ops, who: 'Austin' });
  assert.equal(res.ok, true);
  assert.deepEqual(res.results.map(r => r.row), [3, 3, 4, 5, 4]);
  assert.equal(vac.log.filter(([op]) => op === 'setValues').length, 1, 'one block write per tab');
  assert.equal(vac.peek(5, 1).v, '999000000000103');
  assert.equal(dhm.peek(3, 1).v, 8);
  assert.equal(dhm.peek(4, 1).v, 9);
  const log = ss.getSheetByName('App Change Log');
  assert.equal(log.getLastRow(), 1 + ops.length);
});

test('a batch with one stale edit writes nothing at all', () => {
  const { ss, vac, ab } = fixture();
  const b = loadBridge(ss);
  const res = b.post({ action: 'batch', ops: [
    { tab: 'Vaccinations', mode: 'new', changes: [{ h: 'Microchip No.', k: 0, v: '999000000000101', kind: 'chip' }, { h: 'Date Given', k: 0, v: '2026-10-17', kind: 'date' }] },
    { tab: 'All Breeds', mode: 'edit', row: 3, changes: [{ h: 'Name', k: 0, v: 'Sunny', kind: 'text' }], expect: [{ h: 'Name', k: 0, v: 'Someone else', kind: 'text' }] },
  ] });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'row_changed');
  assert.equal(res.index, 1);
  assert.equal(vac.getLastRow(), 2);
  assert.equal(ab.peek(3, 3).v, 'Pepper');
  assert.equal(ss.getSheetByName('App Change Log'), null);
});

test('a litter batch adds puppies with consecutive IDs and marks the mating successful', () => {
  const { ss, ab, lit, mat } = fixture();
  const b = loadBridge(ss);
  const pup = (sex, colour) => ({ tab: 'All Breeds', mode: 'new', changes: [
    { h: 'Breed', k: 0, v: 'MALTIPOO', kind: 'text' }, { h: 'Sex', k: 0, v: sex, kind: 'sex' }, { h: 'Colour', k: 0, v: colour, kind: 'text' },
    { h: 'Date of Birth', k: 0, v: '2026-10-15', kind: 'date' }, { h: 'Status', k: 0, v: 'Active', kind: 'status' },
    { h: 'Dam Microchip', k: 0, v: '999000000000103', kind: 'chip' }, { h: 'Sire Microchip', k: 0, v: '999000000000102', kind: 'chip' }] });
  const res = b.post({ action: 'batch', who: 'Austin', ops: [
    { tab: 'Puppies Bred In-House', mode: 'new', changes: [{ h: 'Dam Microchip', k: 0, v: '999000000000103', kind: 'chip' }, { h: 'Litter DOB', k: 0, v: '2026-10-15', kind: 'date' }, { h: 'No. of Puppies', k: 0, v: '2', kind: 'number' }, { h: 'Sex Breakdown', k: 0, v: '1 M, 1 F', kind: 'long' }] },
    pup('M', 'APRICOT'), pup('F', 'CREAM'),
    { tab: 'Mating Records', mode: 'edit', row: 2, changes: [{ h: 'Successful', k: 0, v: 'Yes', kind: 'text' }], expect: [{ h: 'Successful', k: 0, v: '', kind: 'text' }] },
  ] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.results.map(r => r.id), [null, 'A010', 'A011', undefined]);
  assert.equal(ab.peek(5, 1).v, 'A010');
  assert.equal(ab.peek(6, 1).v, 'A011');
  assert.ok(ab.peek(6, 8).f, 'Age formula on every new puppy row');
  assert.equal(lit.peek(2, 10).v, 2);
  assert.equal(mat.peek(2, 8).v, 'Yes');
});

test('dates typed as text and long numbers are not mangled', () => {
  const { ss, vac } = fixture();
  const b = loadBridge(ss);
  b.post({ action: 'save', tab: 'Vaccinations', mode: 'new', changes: [
    { h: 'Microchip No.', k: 0, v: '999000000000101', kind: 'chip' }, { h: 'Batch No.', k: 0, v: '10/04', kind: 'text' },
    { h: 'Certificate No.', k: 0, v: '000123', kind: 'text' }, { h: 'Date Given', k: 0, v: '2026-10-17', kind: 'date' }] });
  assert.equal(vac.peek(3, 5).v, '10/04');
  assert.equal(vac.peek(3, 10).v, '000123');
});

test('new rows grow the sheet when it is full', () => {
  const { ss, vac } = fixture();
  vac.maxRows = 2;
  const b = loadBridge(ss);
  const res = b.post({ action: 'save', tab: 'Vaccinations', mode: 'new', changes: [{ h: 'Microchip No.', k: 0, v: '999000000000101', kind: 'chip' }] });
  assert.equal(res.ok, true);
  assert.equal(res.row, 3);
  assert.ok(vac.maxRows > 3);
});

test('settings are cleaned, saved, and control the reminder trigger', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  const on = b.post({ action: 'settings_set', who: 'Austin', settings: { checks: { licence: false }, breeding: { maxLittersPer12Months: '2', retireAgeYears: 'abc' }, reminders: { enabled: true, hour: 7, extra: 'a@b.co, not-an-email' } } });
  assert.equal(on.ok, true);
  assert.equal(on.settings.checks.licence, false);
  assert.equal(on.settings.checks.healthcheck, true);
  assert.equal(on.settings.breeding.maxLittersPer12Months, 2);
  assert.equal(on.settings.breeding.retireAgeYears, null);
  assert.equal(on.settings.reminders.extra, 'a@b.co');
  assert.equal(b.triggers.length, 1);
  assert.equal(b.triggers[0].spec.hour, 7);
  assert.equal(b.triggers[0].spec.tz, TZ);
  const off = b.post({ action: 'settings_set', settings: { reminders: { enabled: false } } });
  assert.equal(off.ok, true);
  assert.equal(b.triggers.length, 0);
  const r = b.post({ action: 'read', tabs: [] });
  assert.equal(r.settings.checks.licence, false, 'settings persist between calls');
});

test('the daily email lists overdue and upcoming items and skips litters already born', () => {
  const { ss, lit } = fixture();
  const b = loadBridge(ss);
  const d = b.ctx.digestItems_(ss, b.ctx.getSettings_());
  assert.equal(d.overdue.length, 1);
  assert.equal(d.overdue[0].what, 'Vaccination');
  assert.match(d.overdue[0].who, /Biscuit/);
  assert.equal(d.soon.length, 1);
  assert.equal(d.soon[0].what, 'Expected whelping');
  lit.getRange(2, 1, 1, 7).setValues([['999000000000103', '', '', '', '', '', D(addDays(today(), -1))]]);
  const d2 = b.ctx.digestItems_(ss, b.ctx.getSettings_());
  assert.equal(d2.soon.length, 0, 'no whelping reminder once the litter is recorded');
  const t = b.post({ action: 'digest_test' });
  assert.equal(t.ok, true);
  assert.deepEqual(t.to, ['owner@example.com']);
  assert.match(b.mail[0].subject, /1 overdue/);
});

test('photos upload into Drive, are indexed, and only indexed files can be fetched', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  const data = Buffer.from('fake-jpeg-bytes').toString('base64');
  const up = b.post({ action: 'photo_upload', dogKey: '999000000000101', dogName: 'Biscuit', mime: 'image/jpeg', data, who: 'Austin' });
  assert.equal(up.ok, true);
  const r = b.post({ action: 'read', tabs: ['All Breeds'] });
  assert.equal(r.photos['999000000000101'].id, up.id);
  assert.equal(r.tabs['App Photos'], undefined, 'the photo index is not sent as a tab');
  const got = b.post({ action: 'photo_get', id: up.id });
  assert.equal(got.ok, true);
  assert.equal(Buffer.from(got.data, 'base64').toString(), 'fake-jpeg-bytes');
  assert.equal(b.post({ action: 'photo_get', id: 'someone-elses-file' }).ok, false);
  assert.equal(b.post({ action: 'photo_upload', dogKey: '../etc', mime: 'image/jpeg', data }).ok, false);
  const again = b.post({ action: 'photo_upload', dogKey: '999000000000101', mime: 'image/jpeg', data });
  const r2 = b.post({ action: 'read', tabs: [] });
  assert.equal(r2.photos['999000000000101'].id, again.id, 'a new photo replaces the old one in the index');
  assert.equal(ss.getSheetByName('App Photos').getLastRow(), 2);
});

test('the change log read is limited to the latest rows', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  const log = b.ctx.ensureChangeTab_(ss);
  const rows = [];
  for (let i = 0; i < 450; i++) rows.push(['2026-10-17 10:00', 'Austin', 'Edited', 'Kennels', i, '', 'Type', 'a', 'b' + i]);
  log.getRange(2, 1, rows.length, 9).setValues(rows);
  const r = b.post({ action: 'read', tabs: ['App Change Log'] });
  const t = r.tabs['App Change Log'];
  assert.equal(t.rows.length, 400);
  assert.equal(t.rows[t.rows.length - 1].v[8], 'b449');
  assert.equal(t.rows[0].r, 52);
});

test('a script copied without a sheet ID explains how to fix it', () => {
  const { ss } = fixture();
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'K9AppBridge.gs'), 'utf8');
  const ctx = { PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'k'.repeat(40) }) }, ContentService: { MimeType: {}, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) }, SpreadsheetApp: { openById: () => ss }, JSON, String, Object, Array, Number, Math };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const res = JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ key: 'k'.repeat(40), action: 'ping' }) } }).getContent());
  assert.equal(res.ok, false);
  assert.match(res.message, /Copy the script again/);
});

/* ───── regression tests for the independent review ───── */

test('a retried save with the same ID returns the first result instead of saving twice', () => {
  const { ss, vac } = fixture();
  const b = loadBridge(ss);
  const body = { action: 'batch', opId: 'op-1', opHash: 'h1', ops: [{ tab: 'Vaccinations', mode: 'new', changes: [{ h: 'Microchip No.', k: 0, v: '999000000000101', kind: 'chip' }] }] };
  const first = b.post(body);
  const again = b.post(body);
  assert.equal(first.ok, true);
  assert.equal(again.ok, true);
  assert.equal(again.replay, true);
  assert.deepEqual(again.results, first.results);
  assert.equal(vac.getLastRow(), 3, 'only one new row');
  const changed = b.post(Object.assign({}, body, { opHash: 'h2' }));
  assert.equal(changed.error, 'changed_after_save');
});

test('an unknown column stops the whole save before anything is written', () => {
  const { ss, vac, lit } = fixture();
  const b = loadBridge(ss);
  const res = b.post({ action: 'batch', ops: [
    { tab: 'Vaccinations', mode: 'new', changes: [{ h: 'Microchip No.', k: 0, v: '999000000000101', kind: 'chip' }] },
    { tab: 'Puppies Bred In-House', mode: 'new', changes: [{ h: 'Litter D.O.B.', k: 0, v: '2026-10-01', kind: 'date' }] },
  ] });
  assert.equal(res.error, 'no_column');
  assert.match(res.message, /Litter D\.O\.B\./);
  assert.equal(vac.getLastRow(), 2);
  assert.equal(lit.getLastRow(), 1);
});

test('the app’s own log and photo tabs can’t be written through the bridge', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  b.ctx.ensureChangeTab_(ss);
  const res = b.post({ action: 'save', tab: 'App Change Log', mode: 'new', changes: [{ h: 'Person', k: 0, v: 'x', kind: 'text' }] });
  assert.equal(res.error, 'protected');
  assert.equal(b.post({ action: 'save', tab: 'App Photos', mode: 'new', changes: [] }).error, 'protected');
});

test('a dropdown that would refuse a value is caught before anything is written', () => {
  const { ss, ab } = fixture();
  ab.cell(5, 12).rule = { type: 'VALUE_IN_LIST', values: ['Active', 'Retired'], allowInvalid: false };
  const b = loadBridge(ss);
  const res = b.post({ action: 'batch', ops: [
    { tab: 'All Breeds', mode: 'edit', row: 2, changes: [{ h: 'Remarks', k: 0, v: 'ok', kind: 'long' }], expect: [] },
    { tab: 'All Breeds', mode: 'new', changes: [{ h: 'Microchip No.', k: 0, v: '999000000000150', kind: 'chip' }, { h: 'Status', k: 0, v: 'Sold', kind: 'status' }] },
  ] });
  assert.equal(res.error, 'invalid');
  assert.match(res.message, /only accepts: Active, Retired/);
  assert.equal(ab.peek(2, 13).v, undefined, 'the edit was not written either');
  assert.equal(ab.getLastRow(), 4);
});

test('if Sheets refuses part of a save, everything already written is put back', () => {
  const { ss, ab, lit } = fixture();
  ab.cell(6, 11).rule = { type: 'NUMBER_GREATER_THAN', values: [100], allowInvalid: false }; // a rule the bridge doesn't pre-check
  const b = loadBridge(ss);
  const res = b.post({ action: 'batch', ops: [
    { tab: 'Puppies Bred In-House', mode: 'new', changes: [{ h: 'Dam Microchip', k: 0, v: '999000000000103', kind: 'chip' }, { h: 'Litter DOB', k: 0, v: '2026-10-15', kind: 'date' }] },
    { tab: 'All Breeds', mode: 'edit', row: 2, changes: [{ h: 'Remarks', k: 0, v: 'edited', kind: 'long' }], expect: [] },
    { tab: 'All Breeds', mode: 'new', changes: [{ h: 'Name', k: 0, v: 'Pup 1', kind: 'text' }, { h: 'Kennel No.', k: 0, v: '3', kind: 'text' }] },
    { tab: 'All Breeds', mode: 'new', changes: [{ h: 'Name', k: 0, v: 'Pup 2', kind: 'text' }, { h: 'Kennel No.', k: 0, v: '3', kind: 'text' }] },
  ] });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'refused');
  assert.equal(res.rolledBack, true);
  assert.equal(ab.peek(2, 13).v === undefined || ab.peek(2, 13).v === '', true, 'the edit was undone');
  assert.ok(!ab.peek(5, 3).v, 'no puppies were left behind');
  assert.ok(!lit.peek(2, 1).v, 'the litter row was undone');
  assert.equal(ss.getSheetByName('App Change Log'), null, 'nothing was logged as saved');
});

test('a stray formula in a data column is not copied into new rows, and the value is still saved', () => {
  const { ss, vac } = fixture();
  vac.cell(2, 10).f = '=HYPERLINK("https://example.com","C-1")';
  const b = loadBridge(ss);
  const res = b.post({ action: 'save', tab: 'Vaccinations', mode: 'new', changes: [{ h: 'Microchip No.', k: 0, v: '999000000000101', kind: 'chip' }, { h: 'Certificate No.', k: 0, v: 'C-99', kind: 'text' }] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.skipped, []);
  assert.equal(vac.peek(3, 10).v, 'C-99');
  assert.equal(vac.peek(3, 10).f, undefined);
});

test('formulas already filled into empty rows are kept, and array-formula columns are never written', () => {
  const { ss, ab } = fixture();
  for (let r = 5; r <= 30; r++) { ab.cell(r, 8).f = '=IF(R[0]C[-1]="","",1)'; ab.cell(r, 8).v = ''; }
  ab.cell(1, 21).v = 'Age band';
  ab.cell(2, 21).f = '=ARRAYFORMULA(IF(G2:G="","",1))';
  for (let r = 2; r <= 40; r++) ab.cell(r, 21).v = r < 5 ? 1 : '';
  const b = loadBridge(ss);
  const res = b.post({ action: 'save', tab: 'All Breeds', mode: 'new', changes: [{ h: 'Name', k: 0, v: 'Pip', kind: 'text' }, { h: 'Age band', k: 0, v: '9', kind: 'text' }] });
  assert.equal(res.ok, true);
  assert.equal(res.row, 5, 'the new dog goes straight after the last real dog');
  assert.equal(ab.peek(5, 8).f, '=IF(R[0]C[-1]="","",1)', 'the pre-filled formula stays');
  assert.deepEqual(res.skipped, ['Age band']);
  assert.ok(!ab.log.some(([op, a1]) => op === 'setValues' && /U\d/.test(a1)), 'nothing written into the array column');
});

test('rows of unticked tick boxes don’t push new rows to the bottom', () => {
  const { ss, vac } = fixture();
  for (let r = 3; r <= 60; r++) vac.cell(r, 11).v = false;
  const b = loadBridge(ss);
  const res = b.post({ action: 'save', tab: 'Vaccinations', mode: 'new', changes: [{ h: 'Microchip No.', k: 0, v: '999000000000101', kind: 'chip' }] });
  assert.equal(res.row, 3);
  const r = b.post({ action: 'read', tabs: ['Vaccinations'] });
  assert.equal(r.tabs.Vaccinations.rows.length, 2);
});

test('the change log records dates in the sheet’s time zone', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  b.post({ action: 'save', tab: 'All Breeds', mode: 'new', changes: [{ h: 'Name', k: 0, v: 'Pip', kind: 'text' }, { h: 'Date of Birth', k: 0, v: '2026-06-01', kind: 'date' }] });
  assert.match(String(ss.getSheetByName('App Change Log').peek(2, 9).v), /Date of Birth: 2026-06-01/);
});

test('text in plain-text cells is saved exactly, with no apostrophe added', () => {
  const { ss, vac } = fixture();
  vac.cell(3, 10).fmt = '@';
  const b = loadBridge(ss);
  b.post({ action: 'save', tab: 'Vaccinations', mode: 'new', changes: [{ h: 'Microchip No.', k: 0, v: '999000000000101', kind: 'chip' }, { h: 'Certificate No.', k: 0, v: '000123', kind: 'text' }] });
  assert.equal(vac.peek(3, 10).v, '000123');
});

test('a photo is only returned if it is an image inside the photo folder', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  const data = Buffer.from('img').toString('base64');
  b.post({ action: 'photo_upload', dogKey: '999000000000101', dogName: 'Biscuit', mime: 'image/jpeg', data });
  b.ctx.DriveApp._addFile('secret-doc', new (require('./gas-mock').Utilities.newBlob([1], 'application/pdf', 'tax.pdf').constructor)([1], 'application/pdf', 'tax.pdf'), 'other-folder');
  const tab = ss.getSheetByName('App Photos');
  tab.getRange(3, 1, 1, 2).setValues([['999000000000102', 'secret-doc']]);
  const res = b.post({ action: 'photo_get', id: 'secret-doc' });
  assert.equal(res.ok, false);
});

test('read sends each column’s dropdown and tick-box rules, and leaves out very long lists', () => {
  const { ss, ab, mat, lit } = fixture();
  const STER = ['Y', 'N', 'Pending', 'Exempted'];
  ab.cell(2, 9).rule = { type: 'VALUE_IN_LIST', values: STER };
  ab.cell(2, 12).rule = { type: 'VALUE_IN_LIST', values: ['Active', 'Retired', 'Adopted', 'Sold', 'Deceased', ' Active '] };
  ab.cell(2, 11).rule = { type: 'VALUE_IN_LIST', values: ['1', '2', '3'], allowInvalid: true };
  ab.cell(2, 17).rule = { type: 'VALUE_IN_LIST', values: Array.from({ length: 150 }, (_, i) => '999000000000' + (100 + i)) };
  ab.cell(4, 16).rule = { type: 'VALUE_IN_LIST', values: ['LOCAL', 'OTHER'] }; // only on the last row
  mat.cell(2, 8).rule = { type: 'CHECKBOX' };
  lit.cell(2, 15).rule = { type: 'VALUE_IN_LIST', values: ['Kept', 'Sold'] }; // a tab with headers only
  const b = loadBridge(ss);
  const r = b.post({ action: 'read', tabs: ['All Breeds', 'Mating Records', 'Puppies Bred In-House'] });
  assert.equal(r.version, 4);
  const rules = r.tabs['All Breeds'].rules;
  assert.deepEqual(rules[8], { list: STER, strict: true });
  assert.deepEqual(rules[11].list, ['Active', 'Retired', 'Adopted', 'Sold', 'Deceased'], 'trimmed, without repeats');
  assert.equal(rules[10].strict, false, 'a dropdown that allows other values is only a suggestion');
  assert.equal(rules[16], undefined, 'lists of more than 100 choices are left out');
  assert.deepEqual(rules[15].list, ['LOCAL', 'OTHER']);
  assert.equal(rules[0], undefined);
  assert.deepEqual(r.tabs['Mating Records'].rules[7], { checkbox: true, values: null });
  assert.deepEqual(r.tabs['Puppies Bred In-House'].rules[14].list, ['Kept', 'Sold']);
  assert.equal(r.tabs['Puppies Bred In-House'].rows.length, 0);
});

test('quick fill: edits on many dogs write only those boxes, check each dog first and log every change', () => {
  const { ss, ab } = fixture();
  for (let r = 2; r <= 4; r++) ab.cell(r, 9).rule = { type: 'VALUE_IN_LIST', values: ['Y', 'N', 'Pending', 'Exempted'] };
  const b = loadBridge(ss);
  const ident = (id, chip, name) => [{ h: 'Animal ID', k: 0, v: id, kind: 'text' }, { h: 'Microchip No.', k: 0, v: chip, kind: 'chip' }, { h: 'Name', k: 0, v: name, kind: 'text' }];
  const blanks = ['PALS Licence No.', 'Licence Expiry', 'Sterilised'].map(h => ({ h, k: 0, v: '', kind: h === 'Licence Expiry' ? 'date' : 'text' }));
  const op = (row, id, chip, name, lic) => ({ tab: 'All Breeds', mode: 'edit', row, dog: `${name} (${id})`, expect: [...ident(id, chip, name), ...blanks], changes: [
    { h: 'PALS Licence No.', k: 0, v: lic, kind: 'text' }, { h: 'Licence Expiry', k: 0, v: '2027-03-31', kind: 'date' }, { h: 'Sterilised', k: 0, v: 'Y', kind: 'text' }] });
  const res = b.post({ action: 'batch', who: 'Austin', opId: 'qf-1', ops: [op(2, 'A001', '999000000000101', 'Biscuit', 'LIC 0001'), op(3, 'A002', '999000000000102', 'Pepper', '012345'), op(4, 'A009', '999000000000103', 'Toffee', 'LIC 0003')] });
  assert.equal(res.ok, true);
  assert.deepEqual(res.results.map(x => x.written), [3, 3, 3]);
  assert.equal(ab.peek(2, 19).v, 'LIC 0001');
  assert.equal(ab.peek(3, 19).v, '012345', 'a licence number with a leading zero keeps it');
  assert.ok(ab.peek(4, 20).v instanceof Date);
  assert.equal(iso(ab.peek(4, 20).v), '2027-03-31');
  assert.equal(ab.peek(2, 9).v, 'Y');
  assert.equal(ab.peek(2, 3).v, 'Biscuit', 'other boxes are untouched');
  const log = ss.getSheetByName('App Change Log');
  assert.equal(log.getLastRow(), 1 + 9, 'one log line per changed box');
  assert.equal(log.peek(2, 6).v, 'Biscuit (A001)');

  const stale = b.post({ action: 'batch', who: 'Austin', ops: [
    { tab: 'All Breeds', mode: 'edit', row: 2, expect: ident('A001', '999000000000101', 'Biscuit'), changes: [{ h: 'Kennel No.', k: 0, v: '5', kind: 'text' }] },
    { tab: 'All Breeds', mode: 'edit', row: 3, expect: ident('A777', '999000000000102', 'Pepper'), changes: [{ h: 'Kennel No.', k: 0, v: '5', kind: 'text' }] },
  ] });
  assert.equal(stale.ok, false);
  assert.equal(stale.error, 'row_changed');
  assert.equal(stale.index, 1);
  assert.equal(ab.peek(2, 11).v, 1, 'nothing in the group is written when one dog has moved');
});

test('a row with an unticked tick box can still be edited', () => {
  const { ss, ab } = fixture();
  ab.cell(2, 9).rule = { type: 'CHECKBOX' };
  ab.cell(2, 9).v = false;
  const b = loadBridge(ss);
  for (const seen of ['FALSE', '']) {
    const res = b.post({ action: 'save', tab: 'All Breeds', mode: 'edit', row: 2, changes: [{ h: 'Remarks', k: 0, v: 'Checked ' + seen, kind: 'long' }], expect: [{ h: 'Sterilised', k: 0, v: seen, kind: 'yesno' }, { h: 'Name', k: 0, v: 'Biscuit', kind: 'text' }] });
    assert.equal(res.ok, true, `expecting “${seen}” for an unticked box`);
  }
  assert.equal(ab.peek(2, 13).v, 'Checked ');
});

test('dropdown items saved with stray spaces are matched the same way the app is sent them', () => {
  const { ss, ab } = fixture();
  ab.cell(2, 9).rule = { type: 'VALUE_IN_LIST', values: [' Y ', 'N ', ' Pending'] };
  const b = loadBridge(ss);
  const read = b.post({ action: 'read', tabs: ['All Breeds'] });
  assert.deepEqual(read.tabs['All Breeds'].rules[8].list, ['Y', 'N', 'Pending']);
  const save = v => b.post({ action: 'save', tab: 'All Breeds', mode: 'edit', row: 2, changes: [{ h: 'Sterilised', k: 0, v, kind: 'text' }], expect: [{ h: 'Name', k: 0, v: 'Biscuit', kind: 'text' }] });
  const bad = save('Maybe');
  assert.equal(bad.error, 'invalid');
  assert.match(bad.message, /only accepts: Y, N, Pending\./);
  assert.equal(ab.peek(2, 9).v, undefined, 'nothing was written');
  assert.equal(save('Y').ok, true, 'a choice the app offers is accepted');
  assert.equal(ab.peek(2, 9).v, 'Y');
});

const PDF = Buffer.from('%PDF-1.4\n% test\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n').toString('base64');
const JPG = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 74, 70, 73, 70, 0, 1]).toString('base64');
const VAC_SEEN = [{ h: 'Microchip No.', k: 0, v: '999000000000101', kind: 'chip' }, { h: 'Date Given', k: 0, v: '2025-10-10', kind: 'date' }, { h: 'Vaccine Type', k: 0, v: 'DHPPi', kind: 'text' }];
const vacLink = (extra) => Object.assign({ tab: 'Vaccinations', row: 2, expect: VAC_SEEN }, extra);
const docReq = extra => Object.assign({ action: 'doc_upload', who: 'Austin', aid: 'A001', chip: '999000000000101', dog: 'Biscuit (A001)', type: 'Vaccination record', date: '2025-10-10', country: '', note: 'Booster', mime: 'application/pdf', data: PDF }, extra);

test('documents: a PDF is filed in Drive, listed, linked to the dog’s record and logged, and a retry files it once', () => {
  const { ss, vac } = fixture();
  vac.cell(1, 12).v = 'Certificate PDF Link';
  const b = loadBridge(ss);
  const res = b.post(docReq({ link: vacLink(), opId: 'doc-1', opHash: 'h1' }));
  assert.equal(res.ok, true);
  assert.equal(res.linkWritten, true);
  const f = b.files.get(res.doc.id);
  assert.equal(f.folder, b.props.get('DOC_FOLDER_ID'), 'filed in the documents folder');
  assert.equal(b.folders.get(f.folder).name, 'K-9 Salon Dog Documents');
  assert.equal(f.getContentType(), 'application/pdf');
  assert.equal(f.getName(), 'A001 Biscuit (A001) - Vaccination record 2025-10-10.pdf');
  assert.equal(vac.peek(2, 12).v, `https://drive.google.com/file/d/${res.doc.id}/view`, 'the record links to it');
  const idx = ss.getSheetByName('App Documents');
  assert.ok(idx.hidden, 'the index tab is hidden');
  assert.equal(idx.peek(2, 3).v, '999000000000101', 'microchips stay text');
  const docs = b.post({ action: 'read', tabs: ['All Breeds'] }).docs;
  assert.equal(docs.length, 1);
  assert.deepEqual([docs[0].type, docs[0].date, docs[0].note, docs[0].tab, docs[0].row, docs[0].by], ['Vaccination record', '2025-10-10', 'Booster', 'Vaccinations', 2, 'Austin']);
  const log = ss.getSheetByName('App Change Log');
  assert.deepEqual([log.peek(2, 3).v, log.peek(3, 3).v, log.peek(3, 7).v], ['Document', 'Edited', 'Certificate PDF Link']);
  const again = b.post(docReq({ link: vacLink(), opId: 'doc-1', opHash: 'h1' }));
  assert.equal(again.replay, true);
  assert.equal(again.doc.id, res.doc.id);
  assert.equal(b.files.size, 1, 'pressing Save again doesn’t file it twice');
  const got = b.post({ action: 'doc_get', id: res.doc.id });
  assert.equal(got.ok, true);
  assert.equal(got.mime, 'application/pdf');
  assert.equal(got.data, PDF);
});

test('documents: wrong or oversized files are refused, and only the dog’s own record is linked', () => {
  const { ss, vac } = fixture();
  vac.cell(1, 12).v = 'Certificate PDF Link';
  const b = loadBridge(ss);
  assert.match(b.post(docReq({ mime: 'text/html' })).message, /PDF or a JPEG/);
  assert.match(b.post(docReq({ data: JPG })).message, /isn’t a readable PDF/, 'a picture sent as a PDF is refused');
  assert.match(b.post(docReq({ data: 'A'.repeat(14000001) })).message, /too large/);
  assert.match(b.post(docReq({ aid: '', chip: '' })).message, /no animal ID or microchip/);
  assert.match(b.post(docReq({ type: ' ' })).message, /what kind of document/);
  assert.equal(b.files.size, 0, 'nothing was filed');
  const other = b.post(docReq({ aid: 'A002', chip: '999000000000102', dog: 'Pepper (A002)', link: vacLink() }));
  assert.equal(other.ok, true);
  assert.equal(other.doc.tab, '', 'Biscuit’s vaccination isn’t linked to Pepper’s document');
  assert.equal(vac.peek(2, 12).v, undefined);
  vac.cell(2, 12).v = 'https://example.com/scan';
  const kept = b.post(docReq({ type: 'Vaccination record', mime: 'image/jpeg', data: JPG, link: vacLink() }));
  assert.equal(kept.ok, true);
  assert.equal(kept.doc.tab, 'Vaccinations');
  assert.equal(kept.linkWritten, false);
  assert.equal(vac.peek(2, 12).v, 'https://example.com/scan', 'a link already there is left alone');
  assert.match(kept.doc.name, /\.jpg$/);
  const prot = b.post(docReq({ link: { tab: 'App Change Log', row: 2 } }));
  assert.equal(prot.doc.tab, '');
});

test('documents: removing one moves it to the Drive bin, clears the link it wrote, and it can’t be fetched', () => {
  const { ss, vac } = fixture();
  vac.cell(1, 12).v = 'Certificate PDF Link';
  const b = loadBridge(ss);
  const res = b.post(docReq({ link: vacLink() }));
  const keep = b.post(docReq({ type: 'Import permit' }));
  const gone = b.post({ action: 'doc_remove', id: res.doc.id, who: 'Austin' });
  assert.equal(gone.ok, true);
  assert.equal(b.files.get(res.doc.id).trashed, true, 'in the bin, so it can be restored');
  assert.equal(vac.peek(2, 12).v, undefined, 'the link to it is cleared');
  const docs = b.post({ action: 'read', tabs: ['All Breeds'] }).docs;
  assert.deepEqual(docs.map(d => d.id), [keep.doc.id]);
  assert.equal(b.post({ action: 'doc_get', id: res.doc.id }).ok, false);
  assert.equal(b.post({ action: 'doc_remove', id: res.doc.id }).ok, true, 'removing twice is harmless');
  b.ctx.DriveApp._addFile('not-indexed', new (b.files.get(keep.doc.id).constructor)([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4], 'application/pdf', 'x.pdf'), b.props.get('DOC_FOLDER_ID'));
  assert.equal(b.post({ action: 'doc_get', id: 'not-indexed' }).ok, false, 'only files on the list can be fetched');
  const write = b.post({ action: 'batch', ops: [{ tab: 'App Documents', mode: 'edit', row: 2, changes: [{ h: 'Type', k: 0, v: 'x', kind: 'text' }], expect: [] }] });
  assert.equal(write.error, 'protected');
  const log = ss.getSheetByName('App Change Log');
  const actions = []; for (let r = 2; r <= log.getLastRow(); r++) actions.push(log.peek(r, 3).v);
  assert.ok(actions.includes('Removed'));
});

test('the import papers check is off by default and can be turned on', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  assert.equal(b.post({ action: 'read', tabs: [] }).settings.checks.papers, false);
  assert.equal(b.post({ action: 'settings_set', settings: { checks: { papers: true } } }).settings.checks.papers, true);
  assert.equal(b.post({ action: 'read', tabs: [] }).settings.checks.papers, true);
});

test('documents: a record that changed or moved meanwhile isn’t linked, and removal finds the link wherever it went', () => {
  const { ss, vac } = fixture();
  vac.cell(1, 12).v = 'Certificate PDF Link';
  const b = loadBridge(ss);
  const stale = b.post(docReq({ link: vacLink({ expect: [{ h: 'Date Given', k: 0, v: '2025-01-05', kind: 'date' }] }) }));
  assert.equal(stale.ok, true, 'the document is still filed');
  assert.equal(stale.doc.tab, '');
  assert.equal(stale.linkSkipped, 'changed');
  assert.equal(vac.peek(2, 12).v, undefined, 'nothing written into a record the app didn’t show');
  const none = b.post(docReq({ link: vacLink({ expect: [] }) }));
  assert.equal(none.doc.tab, '', 'a link without the record’s details is not made');
  const ok = b.post(docReq({ link: vacLink() }));
  const url = `https://drive.google.com/file/d/${ok.doc.id}/view`;
  assert.equal(vac.peek(2, 12).v, url);
  vac.cell(3, 12).v = url; delete vac.cell(2, 12).v; // the tab was sorted
  assert.equal(b.post({ action: 'doc_remove', id: ok.doc.id }).ok, true);
  assert.equal(vac.peek(3, 12).v, undefined, 'the link is cleared where it is now');
});

test('documents: link columns filled by a formula are left alone, and with several link columns the fitting one is used', () => {
  const { ss, vac } = fixture();
  vac.cell(1, 12).v = 'Certificate PDF Link';
  vac.cell(2, 12).f = '=ARRAYFORMULA(IF(A2:A="","",""))';
  const b = loadBridge(ss);
  const a = b.post(docReq({ link: vacLink() }));
  assert.equal(a.doc.tab, 'Vaccinations', 'still linked in the list');
  assert.equal(a.linkWritten, false, 'an array formula column is never written');
  delete vac.cell(2, 12).f; delete vac.cell(2, 12).v;
  vac.cell(1, 12).v = 'Invoice Link';
  vac.cell(1, 13).v = 'Certificate Link';
  const plain = b.post(docReq({ type: 'Vaccination record', link: vacLink() }));
  assert.equal(plain.linkWritten, false, 'two link columns and no clear fit: neither is written');
  const cert = b.post(docReq({ type: 'Health certificate', link: vacLink() }));
  assert.equal(cert.linkWritten, true);
  assert.equal(vac.peek(2, 13).v, `https://drive.google.com/file/d/${cert.doc.id}/view`);
  assert.equal(vac.peek(2, 12).v, undefined);
});

test('documents: a folder moved to the bin by hand is restored, and older documents still open', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  const first = b.post(docReq({}));
  const folder = b.props.get('DOC_FOLDER_ID');
  b.folders.get(folder).trashed = true;
  const second = b.post(docReq({ type: 'Import permit' }));
  assert.equal(second.ok, true);
  assert.equal(b.props.get('DOC_FOLDER_ID'), folder, 'the same folder is used');
  assert.equal(b.folders.get(folder).trashed, false, 'and taken out of the bin');
  assert.equal(b.post({ action: 'doc_get', id: first.doc.id }).ok, true);
});

test('documents: unusual animal IDs, picture checks, capitals in tab names and a damaged list', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  assert.equal(b.post(docReq({ aid: 'SG/23/01' })).doc.aid, 'SG/23/01', 'any animal ID that fits is kept');
  assert.equal(b.post(docReq({ aid: 'X'.repeat(41) })).doc.aid, '', 'a very long ID is dropped when there is a microchip');
  assert.match(b.post(docReq({ aid: 'X'.repeat(41), chip: '' })).message, /too long/);
  const webp = Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'binary').toString('base64');
  const wave = Buffer.from('RIFF\x10\x00\x00\x00WAVEfmt ', 'binary').toString('base64');
  assert.equal(b.post(docReq({ mime: 'image/webp', data: webp })).ok, true);
  assert.match(b.post(docReq({ mime: 'image/webp', data: wave })).message, /readable picture/);
  const write = b.post({ action: 'batch', ops: [{ tab: 'app documents', mode: 'edit', row: 2, changes: [{ h: 'Type', k: 0, v: 'x', kind: 'text' }], expect: [] }] });
  assert.equal(write.error, 'protected', 'the list is protected whatever the capitals');
  const idx = ss.getSheetByName('App Documents');
  for (let r = 1; r <= idx.getLastRow(); r++) for (let c = 4; c <= 15; c++) { const x = idx.cell(r, c); delete x.v; }
  const r = b.post({ action: 'read', tabs: ['All Breeds'] });
  assert.equal(r.ok, true, 'a damaged list doesn’t stop the app');
  assert.equal(r.docs.length, 3);
});

test('documents: a passing Drive error doesn’t start a new folder, and older folders stay usable', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  const first = b.post(docReq({}));
  const folder = b.props.get('DOC_FOLDER_ID');
  const real = b.ctx.DriveApp.getFolderById;
  let fails = 1;
  b.ctx.DriveApp.getFolderById = id => { if (fails-- > 0) throw new Error('Service error: Drive'); return real(id); };
  b.post(docReq({ type: 'Licence' }));
  assert.equal(b.props.get('DOC_FOLDER_ID'), folder, 'one failed lookup is tried again');
  b.ctx.DriveApp.getFolderById = id => { if (id === folder) throw new Error('No item with the given ID'); return real(id); };
  const next = b.post(docReq({ type: 'Pedigree or registration' }));
  assert.notEqual(b.props.get('DOC_FOLDER_ID'), folder, 'a folder that is really gone is replaced');
  assert.deepEqual(JSON.parse(b.props.get('DOC_FOLDER_IDS')), [folder, b.props.get('DOC_FOLDER_ID')], 'and the old one is remembered');
  assert.equal(b.post({ action: 'doc_get', id: first.doc.id }).ok, true, 'so documents in it still open');
  assert.equal(b.post({ action: 'doc_get', id: next.doc.id }).ok, true);
});

test('documents: opening one takes a binned folder back out, and a damaged list is reported, not emptied', () => {
  const { ss } = fixture();
  const b = loadBridge(ss);
  const doc = b.post(docReq({}));
  const folder = b.props.get('DOC_FOLDER_ID');
  b.folders.get(folder).trashed = true;
  assert.equal(b.post({ action: 'doc_get', id: doc.doc.id }).ok, true);
  assert.equal(b.folders.get(folder).trashed, false);
  const idx = ss.getSheetByName('App Documents');
  idx.getRange = () => { throw new Error('Range not found'); };
  const r = b.post({ action: 'read', tabs: ['All Breeds'] });
  assert.equal(r.ok, true);
  assert.equal(r.docs, null);
  assert.equal(r.docsError, true);
});
