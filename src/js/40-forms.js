/* ───────── single-record forms ───────── */
function suggestions(t, h) {
  const set = new Set(PRESET[h] || []);
  const c = t.idx.get(h);
  if (c != null) { const vals = new Set(); for (const r of t.rows) { const v = r.v[c]; if (v && v.length <= 60) vals.add(v); if (vals.size > 60) break; } if (vals.size <= 60) vals.forEach(v => set.add(v)); }
  const fromTab = (tab, col) => { const x = S.db[tab]; if (!x) return; const cc = x.idx.get(col); if (cc == null) return; x.rows.forEach(r => r.v[cc] && set.add(String(r.v[cc]))); };
  if (STAFF_COLS.test(h)) fromTab('Staff Register', 'Staff Name');
  if (/^staff name$/i.test(h) && t.name !== 'Staff Register') fromTab('Staff Register', 'Staff Name');
  if (KENNEL_COLS.test(h)) fromTab('Kennels', 'Kennel No.');
  if (/breed$/i.test(h)) DOGS.forEach(d => d.breed && set.add(d.breed));
  if (/^colour$|colours$/i.test(h)) DOGS.forEach(d => d.colour && set.add(d.colour));
  if (VET_COLS.test(h)) for (const L of LOGS) { const x = S.db[L.tab]; if (!x) continue; x.headers.forEach((hh, cc) => { if (VET_COLS.test(hh) && /vet/i.test(hh) === /vet/i.test(h)) x.rows.forEach(r => r.v[cc] && set.add(r.v[cc])); }); }
  return Array.from(set).slice(0, 80);
}
function siblingCols(t, chipHeader) {
  const pre = chipHeader.replace(/microchip.*$/i, '').trim();
  const want = pre
    ? { name: [pre + ' Name'], breed: [pre + ' Breed'], dob: [pre + ' DOB'], sex: [pre + ' Gender', pre + ' Sex'], colour: [pre + ' Colour'], source: [pre + ' Source'] }
    : { name: ['Dog Name', 'Registered Name', 'Name'], breed: ['Breed'], dob: ['DOB', 'Date of Birth'], sex: ['Gender', 'Sex'], colour: ['Colour'] };
  const out = [];
  for (const k in want) { const c = want[k].map(h => t.idx.get(h)).find(x => x != null); if (c != null) out.push([k, c]); }
  return out;
}
const dogField = (d, k) => ({ name: d.name, breed: d.breed, dob: d.dob ? isoD(d.dob) : '', sex: d.sex, colour: d.colour, source: d.source }[k] || '');
function dogsDatalist(id = 'dl-dogs', filter = () => true) {
  return `<datalist id="${id}">${DOGS.filter(d => d.chip && filter(d)).map(d => `<option value="${esc(d.chip)}">${esc(`${dogLabel(d)} · ${titleCase(d.breed)}`)}</option>`).join('')}</datalist>`;
}
const isAutoCol = (t, c) => SEQ_COL.test(t.headers[c]) || (t.name === MASTER && t.headers[c] === 'Animal ID');

/** The sheet's dropdown or tick-box rule on a column, when the bridge sends one (version 3). */
const ruleOf = (t, c) => (t && t.rules && t.rules[c]) || null;
/**
 * What a column can hold. {select, kind, bool, options} is a fixed list, {suggest} is free typing with
 * suggestions, null is free typing. The sheet's own dropdown wins over the app's built-in lists.
 */
function choicesFor(t, c, value) {
  const h = t.headers[c], k = t.kinds[c], r = ruleOf(t, c);
  if (['chip', 'date', 'time', 'datetime', 'url'].includes(k)) return null;
  const uniq = a => Array.from(new Set(a.filter(x => x !== '' && x != null).map(String)));
  const cur = value ? [value] : [];
  const kind = ['status', 'sex', 'number'].includes(k) ? k : 'text';
  if (r && r.checkbox) return r.values ? { select: true, kind: 'text', options: uniq([...cur, ...r.values]) } : { select: true, kind: 'bool', bool: true, options: uniq(['TRUE', 'FALSE', ...cur]) };
  if (r && r.list && r.list.length) return r.strict === false ? { suggest: uniq([...r.list, ...suggestions(t, h)]) } : { select: true, kind, options: uniq([...cur, ...r.list]) };
  if (k === 'yesno') return (t.types[c] || {}).b > 0 ? { select: true, kind: 'bool', bool: true, options: uniq(['TRUE', 'FALSE', ...cur]) } : { select: true, kind: 'text', options: uniq([...cur, 'Yes', 'No', ...suggestions(t, h)]) };
  if (k === 'status') return { select: true, kind, options: uniq([...cur, ...STATUS_OPTS, ...suggestions(t, h)]) };
  if (k === 'sex') return { select: true, kind, options: uniq([...cur, 'F', 'M', ...suggestions(t, h)]) };
  return null;
}
function choiceLabel(ch, o) { return ch.bool ? (o === 'TRUE' ? 'Yes' : o === 'FALSE' ? 'No' : o) : ch.kind === 'sex' ? (o === 'F' ? 'F (female)' : o === 'M' ? 'M (male)' : o) : o; }
function selectHTML(ch, value, attrs, blank) {
  return `<select class="sel" ${attrs} data-kind="${ch.kind}"><option value="" ${value ? '' : 'selected'}>${esc(blank)}</option>${ch.options.map(o => `<option value="${esc(o)}" ${o === value ? 'selected' : ''}>${esc(choiceLabel(ch, o))}</option>`).join('')}</select>`;
}

function fieldHTML(t, c, value, opts) {
  const h = t.headers[c], k = t.kinds[c], id = `${opts.prefix || 'f'}-${c}`;
  const computed = opts.computed.has(c);
  const wide = k === 'long' || k === 'url';
  const ch = choicesFor(t, c, value);
  let control;
  if (computed) control = `<div class="calc">${esc(fmtVal(value, k) || 'Filled in by the sheet')}</div><span class="hint">Worked out by a formula in the sheet</span>`;
  else if (opts.readOnly) control = `<div class="calc solid">${esc(fmtVal(value, k) || '—')}</div>`;
  else if (isAutoCol(t, c)) control = opts.mode === 'edit' ? `<div class="calc solid">${esc(value || '—')}</div><span class="hint">${t.name === MASTER ? 'Animal IDs don’t change' : 'Numbered automatically'}</span>` : `<div class="calc">${t.name === MASTER ? `Given when you save (likely ${esc(nextAnimalId())})` : 'Numbered automatically'}</div>`;
  else if (k === 'date') {
    const d = parseDate(value);
    if (value && !d) control = `<input class="inp" id="${id}" data-col="${c}" data-kind="text" value="${esc(value)}"><span class="hint">Saved as text because it isn’t a date</span>`;
    else {
      const sc = SHORTCUTS[h] || [];
      const calc = (CALC[t.name] || {})[h];
      control = `<input class="inp" type="date" id="${id}" data-col="${c}" data-kind="date" value="${d ? isoD(d) : ''}">`
        + (calc ? `<span class="hint auto">Fills in from ${esc(calc[0])}. Change it if needed.</span>` : '')
        + (sc.length ? `<span class="shortcuts" role="group" aria-label="Quick dates for ${esc(h)}">${sc.map(([l, s]) => `<button type="button" data-action="date-add" data-for="${id}" data-days="${s.days || 0}" data-months="${s.months || 0}">${l}</button>`).join('')}<button type="button" data-action="date-add" data-for="${id}" data-clear="1">Clear</button></span>` : '');
    }
  }
  else if (k === 'time' && (!value || /^\d{1,2}:\d{2}$/.test(value))) control = `<input class="inp" type="time" id="${id}" data-col="${c}" data-kind="time" value="${esc(value ? value.padStart(5, '0') : '')}">`;
  else if (ch && ch.select) control = selectHTML(ch, value, `id="${id}" data-col="${c}"`, k === 'status' ? 'No status' : 'Choose…');
  else if (k === 'chip') control = `<input class="inp chip" id="${id}" data-col="${c}" data-kind="chip" inputmode="numeric" list="dl-dogs" value="${esc(value)}" placeholder="Type or scan a microchip" autocomplete="off"><span class="hint" data-chip-hint="${c}" aria-live="polite">${(() => { const d = BYCHIP.get(normChip(value)); return d ? esc(`${dogLabel(d)} · ${titleCase(d.breed)}`) : (t.name === MASTER && h === 'Microchip No.' ? '15 digits for an ISO microchip' : 'Choose a dog to fill in the details'); })()}</span>`;
  else if (k === 'number' && (!value || isFinite(+value))) control = `<input class="inp" type="number" step="any" id="${id}" data-col="${c}" data-kind="number" value="${esc(value)}">`;
  else if (k === 'long') control = `<textarea class="inp" id="${id}" data-col="${c}" data-kind="long">${esc(value)}</textarea>`;
  else if (k === 'url') control = `<input class="inp" type="url" id="${id}" data-col="${c}" data-kind="url" value="${esc(value)}" placeholder="https://">`;
  else if (k === 'datetime') control = `<div class="calc solid">${esc(fmtVal(value, k) || '—')}</div>`;
  else { const sg = ch && ch.suggest ? ch.suggest : suggestions(t, h); control = `<input class="inp" id="${id}" data-col="${c}" data-kind="text" value="${esc(value)}" ${sg.length ? `list="dl-${id}"` : ''} autocomplete="off">${sg.length ? `<datalist id="dl-${id}">${sg.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>` : ''}`; }
  const req = opts.required.has(c) ? ' <span class="req" aria-hidden="true">*</span><span class="sr">(required)</span>' : '';
  const isLabelled = !computed && !opts.readOnly && !(isAutoCol(t, c)) && k !== 'datetime';
  return `<div class="field${wide ? ' wide' : ''}">${isLabelled ? `<label for="${id}">${esc(h)}${req}</label>` : `<span class="flabel">${esc(h)}</span>`}${control}</div>`;
}
function computedCols(tab) {
  const t = S.db && S.db[tab];
  return t && t.formulaCols ? new Set(t.formulaCols) : new Set();
}
function editRow(tab, r) {
  const t = S.db && S.db[tab]; if (!t) return;
  const row = t.rows.find(x => x.r === r);
  if (!row) { toast('That entry is no longer in the sheet. The list has been refreshed.', true); return; }
  openForm({ tab, mode: 'edit', row });
}
function requiredCols(t, cols) {
  const req = new Set();
  const L = LOG[t.name] || {};
  if (L.readOnly) return req;
  if (t.name === MASTER) ['Microchip No.', 'Breed', 'Sex', 'Date of Birth'].forEach(h => t.idx.has(h) && req.add(t.idx.get(h)));
  else {
    const fc = cols.find(c => t.kinds[c] === 'chip' && !/sire/i.test(t.headers[c]));
    if (fc != null) req.add(fc);
    if (L.date && t.idx.has(L.date)) req.add(t.idx.get(L.date));
    if (fc == null && !L.date) req.add(cols.find(c => !isAutoCol(t, c)));
  }
  return req;
}
function openForm({ tab, mode, row, preset = {} }) {
  const t = S.db && S.db[tab];
  if (!t) { toast(`The sheet has no “${tab}” tab.`, true); return; }
  const L = LOG[tab] || { tab, noun: 'dog', label: tab };
  const readOnly = !!L.readOnly;
  const isMaster = tab === MASTER;
  const computed = computedCols(tab);
  const cols = t.headers.map((h, c) => c).filter(c => t.headers[c] && !hiddenCol(L, t.headers[c]));
  const vals = {};
  cols.forEach(c => { vals[c] = row ? (row.v[c] || '') : ''; });
  if (mode === 'new') {
    if (isMaster) { const s = t.idx.get('Status'); if (s != null) vals[s] = 'Active'; }
    if (L.date && t.idx.has(L.date)) vals[t.idx.get(L.date)] = isoD(TODAY);
    if (preset.chip) { const c = cols.find(x => t.kinds[x] === 'chip'); if (c != null) vals[c] = preset.chip; }
    Object.entries(preset.values || {}).forEach(([h, v]) => { const c = t.idx.get(h); if (c != null) vals[c] = v; });
  }
  const required = requiredCols(t, cols);
  const title = readOnly ? cap(L.noun) : mode === 'new' ? (isMaster ? 'Add a dog' : `New ${L.noun}`) : (isMaster ? `Edit ${dogName(DOGS.find(d => d.row === row) || {})}` : `Edit ${L.noun}`);
  const sub = mode === 'new' ? `Saves as a new row in the “${esc(t.name)}” tab` : `Row ${row.r} of the “${esc(t.name)}” tab`;
  const opts = { computed, readOnly, mode, required };
  const o = modal('form', {
    title, sub, form: true,
    body: `<p class="form-warn" id="form-warn" hidden></p><div class="form-grid">${cols.map(c => fieldHTML(t, c, vals[c], opts)).join('')}</div>${dogsDatalist()}`,
    foot: `<span class="msg" id="form-msg" aria-live="polite">${readOnly ? 'Read-only: these rows come from your Google Form.' : S.conn.state === 'live' ? (required.size ? 'Fields marked * are needed.' : '') : 'Not connected to Google Sheets right now, so saving may fail.'}</span>
      <button type="button" class="btn" data-action="close-top">${readOnly ? 'Close' : 'Cancel'}</button>${readOnly ? '' : `<button type="submit" class="btn primary" id="form-save">Save</button>`}`,
    guard: () => formGuard(o),
  });
  o.job = { tab, mode, row, cols, headers: t.headers.slice(), orig: row ? row.v.slice() : null, dirty: false, prefix: 'f' };
  const form = $('form', o.el);
  form.addEventListener('input', e => { o.job.dirty = true; onFieldChange(o, e.target); });
  form.addEventListener('change', e => { o.job.dirty = true; onFieldChange(o, e.target); });
  form.addEventListener('submit', e => { e.preventDefault(); submitForm(o); });
  $$('[data-kind="chip"]', form).forEach(el => { if (el.value) fillFromChip(o, el, true); });
  if (mode === 'new') $$('[data-kind="date"]', form).forEach(el => el.value && applyCalc(o, el));
  if (preset.chip) setTimeout(() => { const f = $$('input:not([readonly]):not([data-kind="chip"]):not([type=hidden]),select,textarea', form)[0]; if (f) f.focus(); }, 40);
}
function formGuard(o) {
  if (!o.job || o.job.saving) return !(o.job && o.job.saving);
  if (!o.job.dirty) return true;
  const foot = $('.m-f', o.el);
  if ($('.guard', foot)) return false;
  const g = document.createElement('div');
  g.className = 'guard';
  g.setAttribute('role', 'alert');
  g.innerHTML = `<span>Discard what you’ve entered?</span><span class="sp"></span><button type="button" class="btn sm" data-action="guard-keep">Keep editing</button><button type="button" class="btn sm primary" data-action="guard-discard">Discard</button>`;
  foot.prepend(g);
  $('button', g).focus();
  return false;
}
function onFieldChange(o, el) {
  if (!el || !el.dataset) return;
  if (el.dataset.kind === 'chip') fillFromChip(o, el, false);
  if (el.dataset.kind === 'date') applyCalc(o, el);
  if (el.dataset.auto) delete el.dataset.auto;
}
function fillFromChip(o, el, initial) {
  const t = S.db[o.job.tab];
  const c = +el.dataset.col;
  const d = BYCHIP.get(normChip(el.value));
  const hint = $(`[data-chip-hint="${c}"]`, o.el);
  if (t.name === MASTER) {
    if (hint && t.headers[c] === 'Microchip No.') { const n = normChip(el.value); const dup = DOGS.find(x => x.chip === n && (!o.job.row || x.row.r !== o.job.row.r)); hint.textContent = dup ? `Already used by ${dogLabel(dup)}` : n ? chipInfo(n).text : '15 digits for an ISO microchip'; hint.classList.toggle('crit-t', !!dup); }
    else if (hint) hint.textContent = d ? `${dogLabel(d)} · ${titleCase(d.breed)}` : el.value ? 'Not a dog in All Breeds' : 'Choose a dog';
    return;
  }
  if (hint) { hint.textContent = d ? `${dogLabel(d)} · ${titleCase(d.breed)}` : el.value ? 'No dog with this microchip in All Breeds' : 'Choose a dog to fill in the details'; hint.classList.toggle('warn-t', !d && !!el.value); }
  if (t.name === 'Mating Records' && /^dam/i.test(t.headers[c])) showRuleWarning(o, d);
  if (!d) return;
  for (const [k, col] of siblingCols(t, t.headers[c])) {
    const f = $(`#${o.job.prefix}-${col}`, o.el);
    if (!f || f.readOnly) continue;
    if (!f.value || f.dataset.auto || initial) { if (initial && f.value) continue; f.value = dogField(d, k); f.dataset.auto = '1'; }
  }
}
function showRuleWarning(o, d) {
  const w = $('#form-warn', o.el);
  if (!w) return;
  const flags = d && isFemale(d) ? breedingFlags(d).filter(f => f.sev === 'crit') : [];
  w.hidden = !flags.length;
  w.innerHTML = flags.length ? `${icon('info')}<span><b>${esc(dogName(d))} isn’t eligible under your breeding rules:</b> ${esc(flags.map(f => f.text).join('; '))}. You can still save this record.</span>` : '';
}
function applyCalc(o, el) {
  const t = S.db[o.job.tab];
  const src = t.headers[+el.dataset.col];
  const rules = CALC[t.name] || {};
  const base = parseDate(el.value);
  for (const target in rules) {
    const [from, s] = rules[target];
    if (from !== src) continue;
    const c = t.idx.get(target); if (c == null) continue;
    const f = $(`#${o.job.prefix}-${c}`, o.el); if (!f) continue;
    if (!f.value || f.dataset.auto) { f.value = base ? isoD(shift(base, s)) : ''; f.dataset.auto = '1'; }
  }
}
function dateAdd(btn) {
  const o = topOverlay();
  if (!o) return;
  const f = $('#' + btn.dataset.for, o.el); if (!f) return;
  if (o.job) o.job.dirty = true;
  if (btn.dataset.clear) { f.value = ''; f.dispatchEvent(new Event('change', { bubbles: true })); return; }
  let base = TODAY;
  if (o.job && S.db[o.job.tab]) {
    const t = S.db[o.job.tab];
    const L = LOG[t.name] || {};
    const bc = L.date ? t.idx.get(L.date) : undefined;
    const baseEl = bc != null ? $(`#${o.job.prefix}-${bc}`, o.el) : null;
    base = (baseEl && parseDate(baseEl.value)) || TODAY;
  }
  f.value = isoD(shift(base, { days: +btn.dataset.days, months: +btn.dataset.months }));
  f.dispatchEvent(new Event('change', { bubbles: true }));
}
function collect(o) {
  const t = S.db[o.job.tab];
  const values = {};
  $$('input[data-col],select[data-col],textarea[data-col]', o.el).forEach(el => { const c = +el.dataset.col; values[c] = { v: String(el.value || '').trim(), kind: el.dataset.kind || t.kinds[c] }; });
  if (o.job.tab === MASTER) { const c = t.idx.get('Microchip No.'); if (c != null && values[c]) values[c].v = normChip(values[c].v) || values[c].v; }
  return values;
}
function validate(o, values) {
  const t = S.db[o.job.tab];
  const missing = [];
  for (const c of requiredCols(t, o.job.cols)) if (values[c] && !values[c].v) missing.push(t.headers[c]);
  if (missing.length) return { msg: `Please fill in ${missing.join(', ')}.`, focus: missing[0] };
  if (o.job.tab === MASTER) {
    const c = t.idx.get('Microchip No.');
    const n = values[c] && values[c].v;
    const dup = n && DOGS.find(x => x.chip === n && (!o.job.row || x.row.r !== o.job.row.r));
    if (dup) return { msg: `Microchip ${n} is already used by ${dogLabel(dup)}.`, focus: 'Microchip No.' };
  }
  return null;
}
function sameVal(kind, a, b) {
  a = String(a == null ? '' : a).trim(); b = String(b == null ? '' : b).trim();
  if (kind === 'date') { const x = parseDate(a), y = parseDate(b); if (x && y) return x.getTime() === y.getTime(); }
  if (kind === 'chip') return normChip(a) === normChip(b) && (normChip(a) !== '' || a === b);
  if (kind === 'number' && a !== '' && b !== '') return +a === +b;
  return a === b;
}
async function submitForm(o) {
  const msg = $('#form-msg', o.el), btn = $('#form-save', o.el);
  const values = collect(o);
  const err = validate(o, values);
  const t = S.db[o.job.tab];
  if (err) {
    msg.textContent = err.msg; msg.className = 'msg err';
    const c = t.idx.get(err.focus); const f = c != null && $(`#${o.job.prefix}-${c}`, o.el); if (f) f.focus();
    return;
  }
  const job = o.job;
  const changes = [];
  for (const c of job.cols) {
    const x = values[c]; if (!x) continue;
    if (job.mode === 'edit' && sameVal(x.kind, x.v, job.orig[c])) continue;
    if (job.mode === 'new' && x.v === '') continue;
    changes.push({ h: job.headers[c], c, v: x.v, kind: x.kind });
  }
  if (!changes.length) { closeTop(true); toast('Nothing changed, so nothing was saved.'); return; }
  const chipC = job.cols.find(c => t.kinds[c] === 'chip');
  const dog = chipC != null ? findDog(values[chipC] && values[chipC].v) : null;
  job.dog = dog ? dogLabel(dog) : job.tab === MASTER ? (values[t.idx.get('Name')] || {}).v || '' : '';
  job.saving = true; btn.disabled = true; btn.textContent = 'Saving…';
  msg.textContent = 'Checking the sheet, then saving…'; msg.className = 'msg';
  try {
    const res = await saveRow(job, changes);
    job.saving = false;
    closeTop(true);
    toast(res.id ? `Saved. ${res.id} added to All Breeds, row ${res.row}.` : `Saved to “${job.tab}”, row ${res.row}`);
    applyLocal(job, changes, res.row, res.id);
    scheduleRefresh();
  } catch (e) {
    job.saving = false; btn.disabled = false; btn.textContent = 'Save';
    if (savedBefore(e)) return;
    msg.textContent = e.userMessage || String(e.message || e); msg.className = 'msg err';
    if (keepOpAfter(e)) btn.textContent = 'Save again';
    if (e.refresh) scheduleRefresh(800);
  }
}
function applyLocal(job, changes, rowNum, id) {
  const t = S.db[job.tab]; if (!t) return;
  let row = t.rows.find(r => r.r === rowNum);
  if (!row) { row = { r: rowNum, v: new Array(t.headers.length).fill('') }; t.rows.push(row); t.lastRow = Math.max(t.lastRow, rowNum); }
  for (const ch of changes) {
    let v = ch.v;
    if (ch.kind === 'date') { const d = parseDate(v); v = d ? isoD(d) : v; }
    if (ch.kind === 'chip') v = normChip(v) || v;
    const c = ch.c != null ? ch.c : t.idx.get(ch.h);
    if (c != null) row.v[c] = v;
  }
  if (id && job.tab === MASTER && t.idx.has('Animal ID')) row.v[t.idx.get('Animal ID')] = id;
  rebuild(); renderAll();
}
