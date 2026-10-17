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
const qfCk = (key, h) => key + '\u0001' + h;

/** A key that stays with the dog: its microchip or animal ID, or its row when another dog shares those. */
function qfKeyOf(d) {
  if (d.chip && BYCHIP.get(d.chip) === d) return d.chip;
  if (d.id && BYID.get(d.id) === d) return 'id:' + d.id;
  return 'row:' + d.row.r;
}
function qfDogByKey(key) {
  if (key.startsWith('id:')) return BYID.get(key.slice(3)) || null;
  if (key.startsWith('row:')) { const r = +key.slice(4); return DOGS.find(d => d.row.r === r) || null; }
  return BYCHIP.get(key) || null;
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

function openQuickFill(opts = {}) {
  if (!S.db || !S.db[MASTER]) return;
  if (needBridge('Quick fill')) return;
  const t = S.db[MASTER];
  const presets = QF_PRESETS.filter(p => qfPresetOk(t, p));
  const editable = qfEditable(t);
  if (!editable.length) { toast('All Breeds has no columns the app can fill in.', true); return; }
  const start = presets.find(p => p.id === opts.preset) || presets.find(p => opts.issue && p.issue === opts.issue) || null;
  const st = { seen: new Map(), edits: new Map(), shown: [], retry: null, q: '', focusFirst: !!start };
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
  o.el.addEventListener('click', e => { const b = e.target.closest('[data-qf-fill]'); if (b) qfFillBlanks(o, +b.dataset.qfFill); });
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
function qfList(st, cols) {
  const issue = st.preset && st.preset.issue;
  const blank = d => cols.some(x => !String(d.row.v[x.c] || '').trim());
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
function qfControl(t, col, value, id, label, autofocus) {
  const { h, c } = col, k = t.kinds[c];
  const a = `id="${id}" data-h="${esc(h)}" data-col="${c}"${label ? ` aria-label="${esc(label)}"` : ''}${autofocus ? ' autofocus' : ''}`;
  const ch = choicesFor(t, c, value);
  if (ch && ch.select) return selectHTML(ch, value, a, 'Not set');
  if (k === 'date') { const d = parseDate(value); if (d || !value) return `<input class="inp" type="date" ${a} data-kind="date" value="${d ? isoD(d) : ''}">`; }
  if (k === 'chip') return `<input class="inp chip" ${a} data-kind="chip" inputmode="numeric" autocomplete="off" spellcheck="false" value="${esc(value)}">`;
  if (k === 'number' && (!value || isFinite(+value))) return `<input class="inp" type="number" step="any" ${a} data-kind="number" value="${esc(value)}">`;
  return `<input class="inp" ${a} data-kind="${k === 'long' ? 'long' : 'text'}" value="${esc(value)}" autocomplete="off" spellcheck="false"${QF_UNIQUE.test(h) ? '' : ` list="qf-dl-${c}"`}>`;
}
function qfDraw(o) {
  const st = o.qf, t = S.db[MASTER];
  const cols = st.cols.map(h => ({ h, c: t.idx.get(h) })).filter(x => x.c != null);
  $('#qf-which', o.el).innerHTML = qfWhichHTML(st);
  const list = qfList(st, cols);
  const edited = new Set(Array.from(st.edits.values()).map(e => e.key));
  st.shown = [];
  const rows = list.map((d, i) => {
    const key = qfKeyOf(d);
    // dogs you have typed into keep the values you saw; the others show the latest data
    if (!edited.has(key) || !st.seen.has(key)) st.seen.set(key, { r: d.row.r, v: d.row.v.slice(), label: dogLabel(d) });
    const snap = st.seen.get(key);
    st.shown.push(key);
    const sub = [d.id, titleCase(d.breed), d.status || 'No status', d.chip].filter(Boolean).join(' · ');
    return `<tr data-key="${esc(key)}"><th scope="row"><b>${nameHTML(d)}</b><small>${esc(sub)}</small></th>${cols.map((col, j) => {
      const e = st.edits.get(qfCk(key, col.h));
      return `<td class="${e ? 'chg' : ''}">${qfControl(t, col, e ? e.v : (snap.v[col.c] || ''), `qf-${i}-${j}`, `${col.h} for ${dogLabel(d)}`, st.focusFirst && !i && !j)}</td>`;
    }).join('')}</tr>`;
  }).join('');
  st.focusFirst = false;
  const lists = cols.filter(x => !QF_UNIQUE.test(x.h) && !['date', 'chip', 'number'].includes(t.kinds[x.c])).map(x => { const ch = choicesFor(t, x.c, ''); const sg = ch && ch.suggest ? ch.suggest : ch ? [] : suggestions(t, x.h); return sg.length ? `<datalist id="qf-dl-${x.c}">${sg.map(s => `<option value="${esc(s)}"></option>`).join('')}</datalist>` : ''; }).join('');
  const fills = list.length ? cols.filter(x => !QF_UNIQUE.test(x.h)).map(x => `<div class="qf-fill"><label for="qf-fill-${x.c}">Fill every blank “${esc(x.h)}” box in this list with</label>${qfControl(t, x, '', `qf-fill-${x.c}`, '', false)}<button type="button" class="btn sm" data-qf-fill="${x.c}">Fill blanks</button></div>`).join('') : '';
  $('#qf-fills', o.el).innerHTML = `<p class="muted small qf-n">${list.length ? `${plural(list.length, 'dog')} in this list, in sheet order.` : ''}</p>${fills}`;
  $('#qf-table', o.el).innerHTML = list.length
    ? `<div class="table-wrap qf-wrap"><table class="qf-table"><caption class="sr">${esc(cols.map(x => x.h).join(' and '))} for each dog</caption><thead><tr><th scope="col">Dog</th>${cols.map(x => `<th scope="col">${esc(x.h)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>${lists}`
    : `<div class="empty"><h2>No dogs to show</h2><p>${st.which === 'todo' ? 'No dogs are flagged for this right now. ' : ''}Try another choice under “Which dogs”.</p></div>`;
  qfCount(o);
}
function qfSay(o, text, bad) { const m = $('#qf-msg', o.el); if (m) { m.textContent = text; m.className = 'msg' + (bad ? ' err' : ''); } }
function qfCount(o) {
  const st = o.qf, all = Array.from(st.edits.values());
  const n = new Set(all.map(e => e.key)).size;
  const hidden = all.some(e => !st.cols.includes(e.h) || !st.shown.includes(e.key)); // typed under another choice
  o.job.dirty = n > 0;
  $('#qf-count', o.el).textContent = n ? `${plural(n, 'dog')} changed${hidden ? ', some not in this list' : ''}` : '';
  $('#qf-save', o.el).textContent = n ? `Save ${plural(n, 'dog')}` : 'Save';
}
function qfSet(o, el) {
  const st = o.qf, t = S.db[MASTER];
  const tr = el.closest('tr'); if (!tr) return;
  const key = tr.dataset.key, h = el.dataset.h, c = t.idx.get(h);
  const snap = st.seen.get(key);
  if (!snap || c == null) return;
  const v = String(el.value || '').trim(), kind = el.dataset.kind || t.kinds[c];
  const ck = qfCk(key, h);
  if (sameVal(kind, v, snap.v[c] || '')) st.edits.delete(ck); else st.edits.set(ck, { key, h, v, kind });
  const td = el.closest('td');
  if (td) td.classList.toggle('chg', st.edits.has(ck));
  el.removeAttribute('aria-invalid');
  if (!tr.querySelector('[aria-invalid]')) tr.classList.remove('bad');
  qfCount(o);
}
function qfFillBlanks(o, c) {
  const st = o.qf, t = S.db[MASTER], h = t.headers[c];
  const src = $(`#qf-fill-${c}`, o.el);
  const v = String((src && src.value) || '').trim(), kind = (src && src.dataset.kind) || t.kinds[c];
  if (!v) { qfSay(o, `First choose or type what goes in the blank “${h}” boxes.`, true); if (src) src.focus(); return; }
  let n = 0;
  for (const key of st.shown) {
    const snap = st.seen.get(key), ck = qfCk(key, h), e = st.edits.get(ck);
    if (!snap || String(e ? e.v : (snap.v[c] || '')).trim()) continue;
    st.edits.set(ck, { key, h, v, kind }); n++;
  }
  qfDraw(o);
  qfSay(o, n ? `Filled ${plural(n, 'blank box', 'blank boxes')} with “${fmtVal(v, kind === 'bool' ? 'yesno' : kind)}”. Check them, then press Save.` : `There are no blank “${h}” boxes in this list.`);
}
/** Microchips and licence numbers that would end up on two dogs. */
function qfDuplicates(st, t) {
  const out = [];
  const hs = new Set(Array.from(st.edits.values()).map(e => e.h).filter(h => QF_UNIQUE.test(h)));
  for (const h of hs) {
    const c = t.idx.get(h); if (c == null) continue;
    const norm = t.kinds[c] === 'chip' ? normChip : s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
    const owners = new Map();
    for (const d of DOGS) {
      const key = qfKeyOf(d), e = st.edits.get(qfCk(key, h));
      const raw = e ? e.v : d.row.v[c], n = norm(raw);
      if (!n) continue;
      if (!owners.has(n)) owners.set(n, { shown: String(raw).trim(), list: [] });
      owners.get(n).list.push({ key, label: dogLabel(d), edited: !!e });
    }
    for (const x of owners.values()) if (x.list.length > 1 && x.list.some(y => y.edited)) out.push(Object.assign({ h }, x));
  }
  return out;
}
function qfMarkBad(o, keys, h) {
  $$('#qf-table tr.bad', o.el).forEach(x => x.classList.remove('bad'));
  let first = null;
  for (const key of keys) {
    const tr = $$('#qf-table tbody tr', o.el).find(x => x.dataset.key === key);
    if (!tr) continue;
    tr.classList.add('bad');
    const el = (h && $$('[data-h]', tr).find(x => x.dataset.h === h)) || $('td.chg [data-h]', tr) || $('[data-h]', tr);
    if (el) { el.setAttribute('aria-invalid', 'true'); first = first || el; }
  }
  if (first) first.focus();
}
/** One edit per dog that changed, checked against what you saw: its ID, microchip, name and the boxes you changed. */
function qfOps(st, t) {
  const by = new Map();
  for (const [ck, e] of st.edits) {
    if (!t.idx.has(e.h) || !st.seen.has(e.key)) { st.edits.delete(ck); continue; }
    if (!by.has(e.key)) by.set(e.key, []);
    by.get(e.key).push(e);
  }
  const ops = [];
  for (const [key, list] of by) {
    const snap = st.seen.get(key);
    const hs = new Set(QF_IDENT.filter(h => t.idx.has(h)));
    const changes = list.map(e => { hs.add(e.h); const c = t.idx.get(e.h); return { h: e.h, k: occOf(t.headers, c), v: e.kind === 'chip' ? (normChip(e.v) || e.v) : e.v, kind: e.kind }; });
    const expect = Array.from(hs).map(h => t.idx.get(h)).filter(c => !t.formulaCols.has(c)).map(c => ({ h: t.headers[c], k: occOf(t.headers, c), v: expectVal(snap.v[c]), kind: t.kinds[c] }));
    ops.push({ tab: MASTER, mode: 'edit', row: snap.r, dog: snap.label, changes, expect, _key: key });
  }
  return ops.sort((a, b) => a.row - b.row);
}
function qfApplySaved(st, ops) {
  const t = S.db[MASTER];
  for (const op of ops) {
    const snap = st.seen.get(op._key), d = qfDogByKey(op._key);
    for (const ch of op.changes) {
      const c = t.idx.get(ch.h);
      let v = ch.v;
      if (ch.kind === 'date') { const x = parseDate(v); v = x ? isoD(x) : v; }
      if (ch.kind === 'chip') v = normChip(v) || v;
      if (c != null && snap) snap.v[c] = v;
      if (c != null && d && d.row.r === op.row) d.row.v[c] = v;
      st.edits.delete(qfCk(op._key, ch.h));
    }
  }
}
/** After a row changed in the sheet: load the latest data, keep what you typed unless someone else filled that box. */
async function qfResync(o) {
  await deskLoad();
  const st = o.qf, t = S.db[MASTER];
  let conflicts = 0;
  const keys = new Set(Array.from(st.edits.values()).map(e => e.key));
  for (const key of keys) {
    const d = qfDogByKey(key), snap = st.seen.get(key);
    const same = d && snap && (!key.startsWith('row:') || QF_IDENT.every(h => { const c = t.idx.get(h); return c == null || sameVal(t.kinds[c], d.row.v[c], snap.v[c]); }));
    for (const [ck, e] of st.edits) {
      if (e.key !== key) continue;
      const c = t.idx.get(e.h);
      if (!same || c == null || !sameVal(t.kinds[c], d.row.v[c] || '', snap.v[c] || '')) { st.edits.delete(ck); conflicts++; }
    }
    if (same) st.seen.set(key, { r: d.row.r, v: d.row.v.slice(), label: dogLabel(d) });
  }
  qfDraw(o);
  return { conflicts };
}
async function qfSave(o) {
  const st = o.qf, t = S.db[MASTER];
  if (o.job.saving) return;
  if (!st.edits.size) { qfSay(o, 'Nothing has changed yet.', true); return; }
  const dup = qfDuplicates(st, t);
  if (dup.length) {
    const x = dup[0];
    qfMarkBad(o, x.list.filter(y => y.edited).map(y => y.key), x.h);
    qfSay(o, `${x.h} ${x.shown} is on ${x.list.map(y => y.label).join(' and ')}. Each dog needs its own.${dup.length > 1 ? ` ${plural(dup.length - 1, 'other number is', 'other numbers are')} repeated too.` : ''}`, true);
    return;
  }
  const ops = qfOps(st, t);
  if (!ops.length) { qfCount(o); qfSay(o, 'Nothing has changed yet.', true); return; }
  const total = ops.length;
  const chunks = [];
  for (let i = 0; i < ops.length; i += QF_CHUNK) chunks.push(ops.slice(i, i + QF_CHUNK));
  const btn = $('#qf-save', o.el), fs = $('#qf-fs', o.el);
  o.job.saving = true; btn.disabled = true; fs.disabled = true;
  btn.textContent = 'Saving…';
  S.conn.state = 'saving'; renderSync();
  let saved = 0, failure = null;
  const skipped = [];
  for (const chunk of chunks) {
    qfSay(o, chunks.length > 1 ? `Saving… ${saved} of ${plural(total, 'dog')} done.` : `Saving ${plural(total, 'dog')}…`);
    const payload = { action: 'batch', ops: chunk.map(({ _key, ...op }) => op) };
    const hash = hashOf(payload);
    const opId = st.retry && st.retry.hash === hash ? st.retry.opId : newOpId();
    try {
      const res = await sendWrite(payload, opId);
      st.retry = null;
      qfApplySaved(st, chunk);
      (res.results || []).forEach(r => { if (r && r.skipped) skipped.push(...r.skipped); });
      saved += chunk.length;
    } catch (e) {
      st.retry = e.keepOp ? { opId, hash } : null; // pressing Save again resends this group with the same ID
      failure = { e, chunk };
      break;
    }
  }
  S.conn.state = 'live'; renderSync();
  o.job.saving = false; btn.disabled = false; fs.disabled = false;
  st.done = (st.done || 0) + saved; // across presses of Save, for the final message
  if (saved) { rebuild(); renderAll(); }
  skippedNote(skipped);
  if (!failure) {
    closeTop(true);
    toast(`Saved ${plural(st.done, 'dog')} to “${MASTER}”`);
    scheduleRefresh(1500);
    return;
  }
  qfCount(o);
  const { e, chunk } = failure;
  const op = e.index != null ? chunk[e.index] : null;
  const label = op ? op.dog : '';
  const done = saved ? `Saved ${saved} of ${plural(total, 'dog')}. ` : '';
  if (e.keepOp) { btn.textContent = 'Save again'; qfSay(o, done + UNCONFIRMED, true); return; }
  if (op) qfMarkBad(o, [op._key]);
  if (e.code === 'row_changed' || e.code === 'row_moved') {
    const who = label || 'A dog';
    qfSay(o, `${done}${who} was changed in the sheet while this list was open, so ${saved ? 'the rest weren’t' : 'nothing was'} saved. Loading the latest data…`, true);
    const r = await qfResync(o);
    qfSay(o, `${done}${who} was changed in the sheet while this list was open. The list now shows the latest data${r.conflicts ? `, and ${plural(r.conflicts, 'box', 'boxes')} someone else had already changed now show${r.conflicts === 1 ? 's' : ''} the sheet’s value` : ''}. Check, then press Save again.`, true);
    return;
  }
  const raw = String(e.userMessage || e.message || e);
  const nothing = /\s*Nothing was saved\.?\s*$/;
  const msg = nothing.test(raw) ? raw.replace(nothing, '') + (saved ? ' The rest weren’t saved.' : ' Nothing was saved.') : raw;
  qfSay(o, `${done}${label ? label + ': ' : ''}${msg}`, true);
  if (e.refresh) scheduleRefresh(800);
}
