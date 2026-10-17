/* ───────── log for many dogs ───────── */
const BULK_MAX = 300;
function bulkTabs() { return LOGS.filter(L => L.bulk && S.db[L.tab] && S.db[L.tab].kinds.includes('chip')); }
function needBridge(what) {
  if (S.bridgeVersion >= NEED_BRIDGE) return false;
  modal('need', { title: `${what} needs the bridge update`, narrow: true, body: `<p>Saving many rows at once uses the new version of your bridge script. Updating it takes about 3 minutes and your data stays where it is.</p>`, foot: `<span class="msg"></span><button class="btn" data-action="close-top">Not now</button><button class="btn primary" data-action="bridge-help">Show me how</button>` });
  return true;
}
function openBulk(tab) {
  if (!S.db) return;
  if (needBridge('Logging for many dogs')) return;
  const tabs = bulkTabs();
  if (!tabs.length) { toast('None of your record tabs can be logged in bulk.', true); return; }
  const st = { tab: tabs.find(L => L.tab === tab) ? tab : tabs[0].tab, sel: new Set(), f: { q: '', group: 'active', breed: '', sex: '', kennel: '' }, confirm: false };
  const breeds = Array.from(new Set(DOGS.map(d => d.breed).filter(Boolean))).sort();
  const kn = kennelList();
  const blocks = Array.from(new Set(kn.map(k => k.block).filter(Boolean)));
  const o = modal('bulk', {
    title: 'Log for many dogs', wide: true, form: true,
    sub: 'Choose the record, tick the dogs, fill in the details once. Each dog gets its own row in the sheet.',
    body: `<div class="field bulk-type"><label for="bk-tab">What are you recording?</label><select class="sel" id="bk-tab">${tabs.map(L => `<option value="${esc(L.tab)}" ${L.tab === st.tab ? 'selected' : ''}>${esc(cap(L.noun))}</option>`).join('')}</select></div>
    <div class="bulk">
      <section class="bulk-dogs" aria-labelledby="bk-h1"><h3 id="bk-h1">1. Which dogs?</h3>
        <div class="bulk-filters">
          <label class="search"><span class="sr">Search dogs</span>${icon('search')}<input class="inp" id="bk-q" placeholder="Name, ID or microchip" autocomplete="off"></label>
          <label class="sr" for="bk-group">Group</label><select class="sel" id="bk-group"><option value="active">Active dogs</option><option value="breeding">Breeding dogs</option><option value="puppies">Puppies under 12 months</option><option value="adults">Adults</option><option value="all">All dogs</option></select>
          <label class="sr" for="bk-breed">Breed</label><select class="sel" id="bk-breed"><option value="">All breeds</option>${breeds.map(b => `<option value="${esc(b)}">${esc(titleCase(b))}</option>`).join('')}</select>
          <label class="sr" for="bk-sex">Sex</label><select class="sel" id="bk-sex"><option value="">Both sexes</option><option value="F">Female</option><option value="M">Male</option></select>
          <label class="sr" for="bk-kennel">Kennel</label><select class="sel" id="bk-kennel"><option value="">Any kennel</option>${blocks.map(b => `<option value="block:${esc(b)}">${esc(b)}</option>`).join('')}${kn.map(k => `<option value="k:${esc(k.no)}">Kennel ${esc(k.no)}</option>`).join('')}</select>
        </div>
        <div class="bulk-bar"><button type="button" class="btn sm" data-bk="all">Tick all shown</button><button type="button" class="btn sm ghost" data-bk="none">Untick all</button><span class="count" id="bk-count" aria-live="polite"></span></div>
        <div class="bulk-list" id="bk-list" role="group" aria-label="Dogs"></div>
      </section>
      <section class="bulk-form" aria-labelledby="bk-h2"><h3 id="bk-h2">2. Details for every dog</h3><div id="bk-fields"></div></section>
    </div>`,
    foot: `<span class="msg" id="bk-msg" aria-live="polite"></span><button type="button" class="btn" data-action="close-top">Cancel</button><button type="submit" class="btn primary" id="bk-save">Save</button>`,
    guard: () => formGuard(o),
  });
  o.job = { tab: st.tab, prefix: 'b', dirty: false };
  o.bulk = st;
  const fieldsFor = () => {
    const t = S.db[st.tab];
    const chipC = t.kinds.indexOf('chip');
    const skip = new Set([chipC, ...siblingCols(t, t.headers[chipC]).map(x => x[1])]);
    const cols = t.headers.map((h, c) => c).filter(c => t.headers[c] && !skip.has(c) && !t.formulaCols.has(c) && !isAutoCol(t, c) && t.kinds[c] !== 'chip');
    const L = LOG[st.tab];
    const vals = {};
    if (L.date && t.idx.has(L.date)) vals[t.idx.get(L.date)] = isoD(TODAY);
    const required = new Set(L.date && t.idx.has(L.date) ? [t.idx.get(L.date)] : []);
    o.job = { tab: st.tab, prefix: 'b', dirty: o.job.dirty, cols, chipC };
    $('#bk-fields', o.el).innerHTML = `<div class="form-grid">${cols.map(c => fieldHTML(t, c, vals[c] || '', { computed: new Set(), mode: 'new', required, prefix: 'b' })).join('')}</div>`;
    $$('[data-kind="date"]', $('#bk-fields', o.el)).forEach(el => el.value && applyCalc(o, el));
  };
  const shown = () => {
    const f = st.f, q = f.q.trim().toLowerCase(), qd = normChip(f.q);
    return DOGS.filter(d => {
      const m = ageMonths(d.dob);
      if (!d.chip) return false;
      if (f.group !== 'all' && !isActive(d)) return false;
      if (f.group === 'breeding' && !onBreedingPremise(d)) return false;
      if (f.group === 'puppies' && !(m != null && m < 12)) return false;
      if (f.group === 'adults' && !(m != null && m >= 12)) return false;
      if (f.breed && d.breed !== f.breed) return false;
      if (f.sex && !String(d.sex).toUpperCase().startsWith(f.sex)) return false;
      if (f.kennel.startsWith('k:') && d.kennel !== f.kennel.slice(2)) return false;
      if (f.kennel.startsWith('block:')) { const k = kn.find(x => x.no === d.kennel); if (!k || k.block !== f.kennel.slice(6)) return false; }
      if (q && !`${d.id} ${d.name} ${d.breed}`.toLowerCase().includes(q) && !(qd.length >= 3 && d.chip.includes(qd))) return false;
      return true;
    }).sort((a, b) => dogName(a).localeCompare(dogName(b)));
  };
  const drawList = () => {
    const list = shown();
    o.shownKeys = list.map(d => d.chip);
    $('#bk-list', o.el).innerHTML = list.length ? list.map(d => `<label class="bk-dog"><input type="checkbox" value="${esc(d.chip)}" ${st.sel.has(d.chip) ? 'checked' : ''}><span><b>${esc(dogName(d))}</b><small>${esc([d.id, titleCase(d.breed), sexWord(d.sex), d.kennel ? 'Kennel ' + d.kennel : ''].filter(Boolean).join(' · '))}</small></span></label>`).join('') : '<p class="muted" style="padding:12px">No dogs match. Dogs without a microchip can’t be logged in bulk.</p>';
    updateCount();
  };
  const updateCount = () => {
    const n = st.sel.size;
    $('#bk-count', o.el).textContent = `${n} ticked`;
    const L = LOG[st.tab];
    $('#bk-save', o.el).textContent = st.confirm ? `Yes, save ${n}` : n ? `Save ${plural(n, L.noun)}` : 'Save';
  };
  $('#bk-tab', o.el).addEventListener('change', e => { st.tab = e.target.value; st.confirm = false; fieldsFor(); updateCount(); });
  [['bk-q', 'q', 'input'], ['bk-group', 'group', 'change'], ['bk-breed', 'breed', 'change'], ['bk-sex', 'sex', 'change'], ['bk-kennel', 'kennel', 'change']].forEach(([id, k, ev]) => $('#' + id, o.el).addEventListener(ev, e => { st.f[k] = e.target.value; drawList(); }));
  $('#bk-list', o.el).addEventListener('change', e => { if (e.target.type !== 'checkbox') return; if (e.target.checked) st.sel.add(e.target.value); else st.sel.delete(e.target.value); st.confirm = false; o.job.dirty = true; updateCount(); });
  o.el.addEventListener('click', e => {
    const b = e.target.closest('[data-bk]'); if (!b) return;
    if (b.dataset.bk === 'all') o.shownKeys.forEach(k => st.sel.add(k)); else st.sel.clear();
    st.confirm = false; drawList();
  });
  const form = $('form', o.el);
  form.addEventListener('input', e => { if (e.target.closest('#bk-fields')) { o.job.dirty = true; onFieldChange(o, e.target); st.confirm = false; updateCount(); } });
  form.addEventListener('change', e => { if (e.target.closest('#bk-fields')) { o.job.dirty = true; onFieldChange(o, e.target); } });
  form.addEventListener('submit', e => { e.preventDefault(); submitBulk(o); });
  fieldsFor(); drawList();
}
async function submitBulk(o) {
  const st = o.bulk, msg = $('#bk-msg', o.el), btn = $('#bk-save', o.el);
  const say = (t, bad) => { msg.textContent = t; msg.className = 'msg' + (bad ? ' err' : ''); };
  const t = S.db[st.tab], L = LOG[st.tab];
  const dogs = Array.from(st.sel).map(c => BYCHIP.get(c)).filter(Boolean);
  if (!dogs.length) return say('Tick at least one dog.', true);
  if (dogs.length > BULK_MAX) return say(`Tick ${BULK_MAX} dogs or fewer at a time.`, true);
  const shared = [];
  $$('#bk-fields input[data-col],#bk-fields select[data-col],#bk-fields textarea[data-col]', o.el).forEach(el => { const c = +el.dataset.col; const v = String(el.value || '').trim(); if (v !== '') shared.push({ h: t.headers[c], k: occOf(t.headers, c), c, v, kind: el.dataset.kind || t.kinds[c] }); });
  if (L.date && t.idx.has(L.date) && !shared.some(x => x.h === L.date)) return say(`Please fill in ${L.date}.`, true);
  if (!st.confirm) { st.confirm = true; btn.textContent = `Yes, save ${dogs.length}`; return say(`This adds ${plural(dogs.length, 'row')} to “${st.tab}”. Press again to confirm.`); }
  const chipH = t.headers[o.job.chipC];
  const sib = siblingCols(t, chipH);
  const ops = dogs.map(d => {
    const changes = [{ h: chipH, k: occOf(t.headers, o.job.chipC), c: o.job.chipC, v: d.chip, kind: 'chip' }, ...sib.map(([f, c]) => ({ h: t.headers[c], k: occOf(t.headers, c), c, v: dogField(d, f), kind: t.kinds[c] })).filter(x => x.v), ...shared];
    return { tab: st.tab, mode: 'new', dog: dogLabel(d), changes: changes.map(({ h, k, v, kind }) => ({ h, k, v, kind })), _local: changes };
  });
  o.job.saving = true; btn.disabled = true; btn.textContent = 'Saving…';
  say(`Saving ${plural(ops.length, 'row')}… This can take up to a minute.`);
  S.conn.state = 'saving'; renderSync();
  if (!o.opId) o.opId = newOpId();
  let res;
  try { res = await sendWrite({ action: 'batch', ops: ops.map(({ _local, ...op }) => op) }, o.opId); o.opId = null; }
  catch (e) {
    S.conn.state = 'live'; renderSync();
    o.job.saving = false; btn.disabled = false;
    if (!e.keepOp) o.opId = null;
    st.confirm = e.keepOp; btn.textContent = e.keepOp ? 'Save again' : 'Try again';
    if (e.refresh) scheduleRefresh(800);
    return say(e.userMessage || String(e.message || e), true);
  }
  S.conn.state = 'live'; renderSync();
  o.job.saving = false; btn.disabled = false;
  closeTop(true);
  skippedNote([].concat(...(res.results || []).map(r => (r && r.skipped) || [])));
  toast(res.replay ? `Already saved: ${plural(ops.length, L.noun)} in “${st.tab}”` : `Saved ${plural(ops.length, L.noun)} to “${st.tab}”`);
  applyLocalBatch(ops, res.results);
  scheduleRefresh(1500);
}
function applyLocalBatch(ops, results) {
  ops.forEach((op, i) => {
    const t = S.db[op.tab]; const r = results && results[i];
    if (!t || !r || !r.row) return;
    let row = op.mode === 'new' ? null : t.rows.find(x => x.r === r.row);
    if (op.mode !== 'new' && !row) return;
    if (!row) { row = { r: r.row, v: new Array(t.headers.length).fill('') }; t.rows.push(row); t.lastRow = Math.max(t.lastRow, r.row); }
    (op._local || op.changes).forEach(ch => { const c = t.idx.get(ch.h); if (c == null) return; let v = ch.v; if (ch.kind === 'date') { const d = parseDate(v); v = d ? isoD(d) : v; } if (ch.kind === 'chip') v = normChip(v); row.v[c] = v; });
    if (r.id && t.idx.has('Animal ID')) row.v[t.idx.get('Animal ID')] = r.id;
  });
  rebuild(); renderAll();
}
