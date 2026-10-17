/* ───────── quick fill: type dog details straight down a list ───────── */
const QF_CHUNK = 40; // dogs per request, so each save stays well inside Google's time limit
const QF_PRESETS = [
  { id: 'licence', label: 'Licence number and expiry', cols: ['PALS Licence No.', 'Licence Expiry'], issue: 'licence' },
  { id: 'kennel', label: 'Kennel', cols: ['Kennel No.'], which: 'blank-active' },
  { id: 'sterilised', label: 'Sterilised', cols: ['Sterilised'], issue: 'sterilise' },
  { id: 'status', label: 'Status', cols: ['Status'], which: 'retired' },
  { id: 'chip', label: 'Microchip number', cols: ['Microchip No.'], issue: 'chip' },
];
const QF_UNIQUE = /^(microchip no\.|pals licence no\.)$/i; // each dog has its own
const QF_IDENT = ['Animal ID', 'Microchip No.', 'Name'];   // checked before saving, so a moved row is never written

/*
 * Each dog in the table has an entry: the row as you saw it (row number, headers, values) and what you typed.
 * An entry finds its dog again by animal ID and microchip, never by a key that could point at another dog.
 */
const qfVal = (en, h) => { const c = en.headers.indexOf(h); return c < 0 ? '' : (en.v[c] || ''); };
function qfSnap(en, d) { en.r = d.row.r; en.headers = S.db[MASTER].headers.slice(); en.v = d.row.v.slice(); en.label = dogLabel(d); }
function qfIndex() {
  const byRow = new Map(), byIdent = new Map();
  for (const d of DOGS) {
    byRow.set(d.row.r, d);
    const k = String(d.id).trim() + '\u0001' + d.chip;
    if (!byIdent.has(k)) byIdent.set(k, []);
    byIdent.get(k).push(d);
  }
  return { byRow, byIdent };
}
/** The dog this entry belongs to now: the same animal ID and microchip (and name, if it has neither), or null. */
function qfMatch(en, ix) {
  const id = String(qfVal(en, 'Animal ID')).trim(), chip = normChip(qfVal(en, 'Microchip No.'));
  const name = String(qfVal(en, 'Name')).trim();
  const same = d => !!d && String(d.id).trim() === id && d.chip === chip && (id || chip || String(d.name).trim() === name);
  const here = ix.byRow.get(en.r);
  if (same(here)) return here;
  const list = (ix.byIdent.get(id + '\u0001' + chip) || []).filter(same);
  return list.length === 1 ? list[0] : null;
}
/** Columns of All Breeds a person can type into (not formulas, not the animal ID). */
function qfEditable(t) {
  return t.headers.map((h, c) => c).filter(c => t.headers[c] && t.idx.get(t.headers[c]) === c && !t.formulaCols.has(c) && !isAutoCol(t, c) && t.kinds[c] !== 'datetime');
}
const qfPresetOk = (t, p) => p.cols.every(h => t.idx.has(h) && !t.formulaCols.has(t.idx.get(h)));
function qfSelect(st, sel) {
  const p = QF_PRESETS.find(x => x.id === sel) || null;
  st.sel = sel;
  st.preset = p;
  st.cols = p ? p.cols.slice() : [sel.replace(/^col:/, '')];
  st.which = p && p.issue ? 'todo' : (p && p.which) || 'blank-active';
}
const qfEdited = st => st.entries.filter(en => en.edits.size);

function openQuickFill(opts = {}) {
  if (!S.db || !S.db[MASTER]) return;
  if (needBridge('Quick fill')) return;
  const t = S.db[MASTER];
  const presets = QF_PRESETS.filter(p => qfPresetOk(t, p));
  const editable = qfEditable(t);
  if (!editable.length) { toast('All Breeds has no columns the app can fill in.', true); return; }
  const start = presets.find(p => p.id === opts.preset) || presets.find(p => opts.issue && p.issue === opts.issue) || null;
  const st = { entries: [], shown: [], seq: 0, retry: null, q: '', done: 0, focusFirst: !!start };
  qfSelect(st, start ? start.id : presets[0] ? presets[0].id : 'col:' + t.headers[editable[0]]);
  const whatHTML = (presets.length ? `<optgroup label="Common">${presets.map(p => `<option value="${p.id}">${esc(p.label)}</option>`).join('')}</optgroup>` : '')
    + `<optgroup label="Any column">${editable.map(c => `<option value="col:${esc(t.headers[c])}">${esc(t.headers[c])}</option>`).join('')}</optgroup>`;
  const o = modal('quickfill', {
    title: 'Quick fill', wide: true, form: true,
    sub: 'Type straight down the list and press Enter to go to the next dog. Nothing is saved until you press Save.',
    body: `<fieldset class="qf-fs" id="qf-fs"><legend class="sr">Dog details to fill in</legend>
      <div class="qf-top">
        <div class="field"><label for="qf-what">What to fill in</label><select class="sel" id="qf-what">${whatHTML}</select></div>
        <div class="field"><label for="qf-which">Which dogs</label><select class="sel" id="qf-which"></select></div>
        <div class="field"><label for="qf-q">Find a dog in the list</label><input class="inp" id="qf-q" placeholder="Name, ID or microchip" autocomplete="off"></div>
      </div>
      ${S.bridgeVersion < BRIDGE_LATEST ? `<p class="note">${icon('info')}<span>Your bridge script doesn’t share the sheet’s dropdown lists yet, so a choice here may not match your sheet and Google will refuse it. <button type="button" class="linkbtn" data-action="bridge-help">Update the bridge</button></span></p>` : ''}
      <div class="qf-fills" id="qf-fills"></div>
      <div id="qf-table"></div>
    </fieldset>`,
    foot: `<span class="msg" id="qf-msg" aria-live="polite">${S.conn.state === 'live' ? '' : 'Not connected to Google Sheets right now, so saving may fail.'}</span><span class="count" id="qf-count" aria-live="polite"></span><button type="button" class="btn" data-action="close-top">Cancel</button><button type="submit" class="btn primary" id="qf-save">Save</button>`,
    guard: () => formGuard(o),
  });
  o.job = { tab: MASTER, dirty: false, saving: false };
  o.qf = st;
  const form = $('form', o.el);
  const what = $('#qf-what', o.el);
  what.value = st.sel;
  what.addEventListener('change', () => { qfSelect(st, what.value); st.focusFirst = false; qfDraw(o); });
  $('#qf-which', o.el).addEventListener('change', e => { st.which = e.target.value; qfDraw(o); });
  $('#qf-q', o.el).addEventListener('input', e => { st.q = e.target.value; qfDraw(o); });
  const onCell = e => { if (e.target.closest('#qf-table') && e.target.dataset.h) qfSet(o, e.target); };
  form.addEventListener('input', onCell);
  form.addEventListener('change', onCell);
  form.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !/^(INPUT|SELECT)$/.test(e.target.tagName)) return;
    e.preventDefault(); // Enter moves on; only the Save button saves
    const m = e.target.id.match(/^qf-(\d+)-(\d+)$/);
    const next = m && $(`#qf-${+m[1] + (e.shiftKey ? -1 : 1)}-${m[2]}`, o.el);
    if (next) { next.focus(); if (next.tagName === 'INPUT') { try { next.select(); } catch (err) { /* not selectable */ } } }
  });
  o.el.addEventListener('click', e => { const b = e.target.closest('[data-qf-fill]'); if (b) qfFillBlanks(o, b.dataset.qfFill); });
  form.addEventListener('submit', e => { e.preventDefault(); qfSave(o); });
  qfDraw(o);
}

function qfWhichHTML(st) {
  const p = st.preset;
  return [
    ...(p && p.issue ? [['todo', `Flagged: ${ISSUE[p.issue].label}`]] : []),
    ['blank-active', 'Active dogs with a blank box'],
    ['blank', 'Any dog with a blank box'],
    ['active', 'All active dogs'],
    ['retired', 'Retired dogs'],
    ['all', 'Every dog'],
  ].map(([v, l]) => `<option value="${v}" ${v === st.which ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
/** The dogs to show. "Blank" means blank in the sheet, so a row stays put while you type into it. */
function qfList(st, t) {
  const issue = st.preset && st.preset.issue;
  const cs = st.cols.map(h => t.idx.get(h)).filter(c => c != null);
  const blank = d => cs.some(c => !String(d.row.v[c] || '').trim());
  const q = st.q.trim().toLowerCase(), qd = normChip(st.q);
  return DOGS.filter(d => {
    if (st.which === 'todo' && !(issue && d.issues.some(i => i.k === issue))) return false;
    if ((st.which === 'blank-active' || st.which === 'active') && !isActive(d)) return false;
    if ((st.which === 'blank-active' || st.which === 'blank') && !blank(d)) return false;
    if (st.which === 'retired' && !isRetired(d)) return false;
    if (q && !`${d.id} ${d.name} ${d.breed}`.toLowerCase().includes(q) && !(qd.length >= 3 && d.chip.includes(qd))) return false;
    return true;
  }).sort((a, b) => a.row.r - b.row.r);
}
function qfControl(t, h, value, id, label, autofocus) {
  const c = t.idx.get(h), k = t.kinds[c];
  const a = `id="${id}" data-h="${esc(h)}"${label ? ` aria-label="${esc(label)}"` : ''}${autofocus ? ' autofocus' : ''}`;
  const ch = choicesFor(t, c, value);
  if (ch && ch.select) return selectHTML(ch, value, a, 'Not set');
  if (k === 'date') { const d = parseDate(value); if (d || !value) return `<input class="inp" type="date" ${a} data-kind="date" value="${d ? isoD(d) : ''}">`; }
  if (k === 'chip') return `<input class="inp chip" ${a} data-kind="chip" inputmode="numeric" autocomplete="off" spellcheck="false" value="${esc(value)}">`;
  if (k === 'number' && (!value || isFinite(+value))) return `<input class="inp" type="number" step="any" ${a} data-kind="number" value="${esc(value)}">`;
  if (k === 'long') return `<textarea class="inp" rows="1" ${a} data-kind="long">${esc(value)}</textarea>`; // keeps line breaks
  return `<input class="inp" ${a} data-kind="text" value="${esc(value)}" autocomplete="off" spellcheck="false"${QF_UNIQUE.test(h) ? '' : ` list="qf-dl-${c}"`}>`;
}
function qfDraw(o) {
  const st = o.qf, t = S.db[MASTER];
  const cols = st.cols.filter(h => t.idx.has(h));
  $('#qf-which', o.el).innerHTML = qfWhichHTML(st);
  const list = qfList(st, t);
  const ix = qfIndex();
  const mine = new Map(); // dog → its entry
  for (const en of st.entries) { const d = qfMatch(en, ix); if (d && !mine.has(d)) mine.set(d, en); }
  st.shown = list.map(d => {
    let en = mine.get(d);
    if (!en) { en = { id: ++st.seq, edits: new Map() }; qfSnap(en, d); st.entries.push(en); mine.set(d, en); }
    else if (!en.edits.size) qfSnap(en, d); // nothing typed yet: show the latest data
    return en;
  });
  const keep = new Set(st.shown);
  st.entries = st.entries.filter(en => en.edits.size || keep.has(en));
  const rows = list.map((d, i) => {
    const en = st.shown[i];
    const sub = [d.id, titleCase(d.breed), d.status || 'No status', d.chip].filter(Boolean).join(' · ');
    return `<tr data-e="${en.id}"><th scope="row"><b>${nameHTML(d)}</b><small>${esc(sub)}</small></th>${cols.map((h, j) => {
      const e = en.edits.get(h);
      return `<td class="${e ? 'chg' : ''}">${qfControl(t, h, e ? e.v : qfVal(en, h), `qf-${i}-${j}`, `${h} for ${dogLabel(d)}`, st.focusFirst && !i && !j)}</td>`;
    }).join('')}</tr>`;
  }).join('');
  st.focusFirst = false;
  const plain = cols.filter(h => !QF_UNIQUE.test(h) && !['date', 'chip', 'number', 'long'].includes(t.kinds[t.idx.get(h)]));
  const lists = plain.map(h => { const c = t.idx.get(h), ch = choicesFor(t, c, ''); const sg = ch && ch.suggest ? ch.suggest : ch ? [] : suggestions(t, h); return sg.length ? `<datalist id="qf-dl-${c}">${sg.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>` : ''; }).join('');
  const fills = list.length ? cols.filter(h => !QF_UNIQUE.test(h)).map((h, j) => `<div class="qf-fill"><label for="qf-fill-${j}">Fill every blank “${esc(h)}” box in this list with</label>${qfControl(t, h, '', `qf-fill-${j}`, '', false)}<button type="button" class="btn sm" data-qf-fill="${j}">Fill blanks</button></div>`).join('') : '';
  $('#qf-fills', o.el).innerHTML = `<p class="muted small qf-n">${list.length ? `${plural(list.length, 'dog')} in this list, in sheet order.` : ''}</p>${fills}`;
  $('#qf-table', o.el).innerHTML = list.length
    ? `<div class="table-wrap qf-wrap"><table class="qf-table"><caption class="sr">${esc(cols.join(' and '))} for each dog</caption><thead><tr><th scope="col">Dog</th>${cols.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${lists}`
    : `<div class="empty"><h2>No dogs to show</h2><p>${st.which === 'todo' ? 'No dogs are flagged for this right now. ' : ''}Try another choice under “Which dogs”.</p></div>`;
  qfCount(o);
}
function qfSay(o, text, bad) { const m = $('#qf-msg', o.el); if (m) { m.textContent = text; m.className = 'msg' + (bad ? ' err' : ''); } }
function qfCount(o) {
  const st = o.qf, edited = qfEdited(st), shown = new Set(st.shown);
  const n = edited.length;
  const hidden = edited.some(en => !shown.has(en) || Array.from(en.edits.keys()).some(h => !st.cols.includes(h))); // typed under another choice
  o.job.dirty = n > 0;
  $('#qf-count', o.el).textContent = n ? `${plural(n, 'dog')} changed${hidden ? ', some not in this list' : ''}` : '';
  $('#qf-save', o.el).textContent = n ? `Save ${plural(n, 'dog')}` : 'Save';
}
const qfEntryOf = (o, el) => { const tr = el.closest('tr[data-e]'); return tr ? o.qf.entries.find(en => en.id === +tr.dataset.e) || null : null; };
function qfSet(o, el) {
  const en = qfEntryOf(o, el), t = S.db[MASTER], h = el.dataset.h;
  if (!en || !t.idx.has(h)) return;
  const v = el.tagName === 'TEXTAREA' ? String(el.value || '').replace(/\s+$/, '') : String(el.value || '').trim();
  const kind = el.dataset.kind || t.kinds[t.idx.get(h)];
  if (sameVal(kind, v, qfVal(en, h))) en.edits.delete(h); else en.edits.set(h, { h, v, kind });
  const td = el.closest('td');
  if (td) td.classList.toggle('chg', en.edits.has(h));
  el.removeAttribute('aria-invalid');
  const tr = el.closest('tr');
  if (tr && !tr.querySelector('[aria-invalid]')) tr.classList.remove('bad');
  qfCount(o);
}
function qfFillBlanks(o, j) {
  const st = o.qf, t = S.db[MASTER];
  const h = st.cols.filter(x => t.idx.has(x) && !QF_UNIQUE.test(x))[+j];
  const src = $(`#qf-fill-${j}`, o.el);
  if (!h || !src) return;
  const v = String(src.value || '').trim(), kind = src.dataset.kind || t.kinds[t.idx.get(h)];
  if (!v) { qfSay(o, `First choose or type what goes in the blank “${h}” boxes.`, true); src.focus(); return; }
  let n = 0;
  for (const en of st.shown) {
    const e = en.edits.get(h);
    if (String(e ? e.v : qfVal(en, h)).trim()) continue;
    en.edits.set(h, { h, v, kind }); n++;
  }
  qfDraw(o);
  const b = $(`[data-qf-fill="${j}"]`, o.el); if (b) b.focus(); // the redraw replaced the button
  qfSay(o, n ? `Filled ${plural(n, 'blank box', 'blank boxes')} with “${fmtVal(v, kind === 'bool' ? 'yesno' : kind)}”. Check them, then press Save.` : `There are no blank “${h}” boxes in this list.`);
}
const qfNorm = (t, h) => (t.kinds[t.idx.get(h)] === 'chip' ? normChip : s => String(s || '').trim().toUpperCase().replace(/\s+/g, ''));
/** Microchips and licence numbers that would end up on two dogs: what you typed, plus the sheet for every other dog. */
function qfDuplicates(st, t) {
  const out = [], ix = qfIndex();
  const hs = new Set([].concat(...qfEdited(st).map(en => Array.from(en.edits.keys()))).filter(h => QF_UNIQUE.test(h) && t.idx.has(h)));
  for (const h of hs) {
    const c = t.idx.get(h), norm = qfNorm(t, h), owners = new Map(), typed = new Set();
    const add = (raw, who) => { const n = norm(raw); if (!n) return; if (!owners.has(n)) owners.set(n, { shown: String(raw).trim(), list: [] }); owners.get(n).list.push(who); };
    for (const en of st.entries) {
      if (!en.edits.has(h)) continue;
      const d = qfMatch(en, ix); if (d) typed.add(d);
      add(en.edits.get(h).v, { label: en.label, en });
    }
    for (const d of DOGS) if (!typed.has(d)) add(d.row.v[c], { label: dogLabel(d), en: null });
    for (const x of owners.values()) if (x.list.length > 1 && x.list.some(y => y.en)) out.push(Object.assign({ h }, x));
  }
  return out;
}
function qfMarkBad(o, ens, h) {
  $$('#qf-table tr.bad', o.el).forEach(x => x.classList.remove('bad'));
  let first = null;
  for (const en of ens) {
    const tr = $(`#qf-table tr[data-e="${en.id}"]`, o.el);
    if (!tr) continue;
    tr.classList.add('bad');
    const el = (h && $$('[data-h]', tr).find(x => x.dataset.h === h)) || $('td.chg [data-h]', tr) || $('[data-h]', tr);
    if (el) { el.setAttribute('aria-invalid', 'true'); first = first || el; }
  }
  if (first) first.focus();
  return !!first;
}
/** One edit per dog that changed, checked against what you saw: its ID, microchip, name and the boxes you changed. */
function qfOps(st, t) {
  const ix = qfIndex(), ops = [];
  for (const en of qfEdited(st)) {
    for (const h of Array.from(en.edits.keys())) if (!t.idx.has(h) || !en.headers.includes(h)) en.edits.delete(h); // column renamed meanwhile
    if (!en.edits.size) continue;
    const hs = new Set(QF_IDENT.filter(h => t.idx.has(h) && en.headers.includes(h)));
    const changes = Array.from(en.edits.values()).map(e => { hs.add(e.h); return { h: e.h, k: occOf(t.headers, t.idx.get(e.h)), v: e.kind === 'chip' ? (normChip(e.v) || e.v) : e.v, kind: e.kind }; });
    const expect = Array.from(hs).filter(h => !t.formulaCols.has(t.idx.get(h))).map(h => ({ h, k: occOf(t.headers, t.idx.get(h)), v: expectVal(qfVal(en, h)), kind: t.kinds[t.idx.get(h)] }));
    ops.push({ tab: MASTER, mode: 'edit', row: en.r, dog: en.label, changes, expect, _en: en, _dog: qfMatch(en, ix) });
  }
  return ops.sort((a, b) => a.row - b.row);
}
/**
 * Groups of at most QF_CHUNK dogs. Dogs swapping microchips or licence numbers with each other go together in the
 * first group, so a half-finished save never leaves two dogs with the same number. Null if there are too many.
 */
function qfChunks(ops, t) {
  const linked = new Set(), byDog = new Map(ops.filter(op => op._dog).map(op => [op._dog, op]));
  for (const op of ops) for (const ch of op.changes) {
    if (!QF_UNIQUE.test(ch.h)) continue;
    const norm = qfNorm(t, ch.h), n = norm(ch.v), c = t.idx.get(ch.h);
    if (!n) continue;
    for (const d of DOGS) if (d !== op._dog && norm(d.row.v[c]) === n) { linked.add(op); if (byDog.has(d)) linked.add(byDog.get(d)); }
  }
  if (linked.size > QF_CHUNK) return null;
  const rest = ops.filter(op => !linked.has(op));
  const chunks = linked.size ? [ops.filter(op => linked.has(op))] : [];
  for (let i = 0; i < rest.length; i += QF_CHUNK) chunks.push(rest.slice(i, i + QF_CHUNK));
  return chunks;
}
function qfApplySaved(chunk) {
  const t = S.db[MASTER];
  for (const op of chunk) {
    const en = op._en, d = op._dog;
    for (const ch of op.changes) {
      let v = ch.v;
      if (ch.kind === 'date') { const x = parseDate(v); v = x ? isoD(x) : v; }
      if (ch.kind === 'chip') v = normChip(v) || v;
      const ec = en.headers.indexOf(ch.h);
      if (ec >= 0) en.v[ec] = v;
      const c = t.idx.get(ch.h);
      if (c != null && d && d.row.r === op.row) d.row.v[c] = v;
      en.edits.delete(ch.h);
    }
  }
}
/** After a row changed in the sheet: load the latest data and keep what you typed, unless that dog or box changed. */
async function qfResync(o) {
  await deskLoad();
  const st = o.qf, ix = qfIndex();
  let conflicts = 0;
  for (const en of qfEdited(st)) {
    const d = qfMatch(en, ix);
    if (!d) { conflicts += en.edits.size; en.edits.clear(); continue; } // can’t tell which dog it is any more
    const fresh = { headers: S.db[MASTER].headers, v: d.row.v };
    for (const h of Array.from(en.edits.keys())) if (!sameVal(S.db[MASTER].kinds[S.db[MASTER].idx.get(h)], qfVal(fresh, h), qfVal(en, h))) { en.edits.delete(h); conflicts++; }
    qfSnap(en, d);
  }
  qfDraw(o);
  return { ok: S.conn.state === 'live', conflicts };
}
async function qfSave(o) {
  const st = o.qf, t = S.db[MASTER];
  if (o.job.saving) return;
  if (!qfEdited(st).length) { qfSay(o, 'Nothing has changed yet.', true); return; }
  const dup = qfDuplicates(st, t);
  if (dup.length) {
    const x = dup[0];
    qfMarkBad(o, x.list.filter(y => y.en).map(y => y.en), x.h);
    qfSay(o, `${x.h} ${x.shown} is on ${x.list.map(y => y.label).join(' and ')}. Each dog needs its own.${dup.length > 1 ? ` ${plural(dup.length - 1, 'other number is', 'other numbers are')} repeated too.` : ''}`, true);
    return;
  }
  const ops = qfOps(st, t);
  if (!ops.length) { qfCount(o); qfSay(o, 'Nothing has changed yet.', true); return; }
  const chunks = qfChunks(ops, t);
  if (!chunks) { qfSay(o, `More than ${QF_CHUNK} dogs are swapping microchips or licence numbers with each other. Save some of those changes first, then the rest.`, true); return; }
  const total = ops.length;
  const btn = $('#qf-save', o.el), fs = $('#qf-fs', o.el);
  o.job.saving = true; S.saving = true; btn.disabled = true; fs.disabled = true;
  btn.textContent = 'Saving…';
  const prev = S.conn.state;
  S.conn.state = 'saving'; renderSync();
  let saved = 0, failure = null;
  const skipped = [];
  for (const chunk of chunks) {
    qfSay(o, chunks.length > 1 ? `Saving… ${saved} of ${plural(total, 'dog')} done.` : `Saving ${plural(total, 'dog')}…`);
    const payload = { action: 'batch', ops: chunk.map(({ _en, _dog, ...op }) => op) };
    const hash = hashOf(payload);
    const opId = st.retry && st.retry.hash === hash ? st.retry.opId : newOpId();
    try {
      const res = await sendWrite(payload, opId);
      st.retry = null;
      qfApplySaved(chunk);
      (res.results || []).forEach(r => { if (r && r.skipped) skipped.push(...r.skipped); });
      saved += chunk.length;
    } catch (e) {
      // pressing Save again resends this group with the same ID, so it is never saved twice
      st.retry = e.keepOp || e.code === 'locked' ? { opId, hash } : null;
      failure = { e, chunk };
      break;
    }
  }
  S.conn.state = prev === 'saving' ? 'live' : prev; renderSync();
  st.done += saved; // across presses of Save, for the final message
  if (saved) { rebuild(); renderAll(); }
  skippedNote(skipped);
  if (!failure) {
    S.saving = false; o.job.saving = false;
    closeTop(true);
    toast(`Saved ${plural(st.done, 'dog')} to “${MASTER}”`);
    scheduleRefresh(1500);
    return;
  }
  const { e, chunk } = failure;
  const op = e.index != null ? chunk[e.index] : null;
  const label = op ? op.dog : '';
  const done = saved ? `Saved ${saved} of ${plural(total, 'dog')}. ` : '';
  const changed = e.code === 'row_changed' || e.code === 'row_moved';
  let re = null;
  if (changed) {
    qfSay(o, `${done}${label || 'A dog'} was changed in the sheet while this list was open, so ${saved ? 'the rest weren’t' : 'nothing was'} saved. Loading the latest data…`, true);
    re = await qfResync(o); // still locked while this runs, so nothing is typed or sent against old data
  } else if (saved) qfDraw(o);
  S.saving = false; o.job.saving = false; btn.disabled = false; fs.disabled = false;
  qfCount(o);
  let focused = false;
  if (e.keepOp) { btn.textContent = 'Save again'; qfSay(o, done + UNCONFIRMED, true); }
  else if (changed) {
    qfSay(o, re.ok
      ? `${done}${label || 'A dog'} was changed in the sheet while this list was open. The list now shows the latest data${re.conflicts ? `, and ${plural(re.conflicts, 'box', 'boxes')} that changed in the sheet ${re.conflicts === 1 ? 'was' : 'were'} put back to the sheet’s value` : ''}. Check, then press Save again.`
      : `${done}${label || 'A dog'} was changed in the sheet while this list was open, and the latest data couldn’t be loaded. Close this list and open it again before saving.`, true);
  } else {
    if (op) focused = qfMarkBad(o, [op._en]);
    const raw = String(e.userMessage || e.message || e);
    const nothing = /\s*Nothing was saved\.?\s*$/;
    const msg = nothing.test(raw) ? raw.replace(nothing, '') + (saved ? ' The rest weren’t saved.' : ' Nothing was saved.') : raw;
    qfSay(o, `${done}${label ? label + ': ' : ''}${msg}`, true);
    if (e.refresh) scheduleRefresh(800);
  }
  if (!focused) btn.focus();
}
