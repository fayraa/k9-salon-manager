/* ───────── reports ───────── */
const REPORT_TABS = [['monthly', 'Monthly AVS report'], ['due', 'Due list'], ['herd', 'Herd summary']];
function viewReports() {
  if (!REPORT_TABS.some(([k]) => k === S.reportTab)) S.reportTab = 'monthly';
  const tabs = `<div class="tabs" role="tablist" aria-label="Reports">${REPORT_TABS.map(([k, l]) => `<button role="tab" id="rt-${k}" aria-selected="${S.reportTab === k}" aria-controls="report-panel" data-action="report-tab" data-tab="${k}">${l}</button>`).join('')}</div>`;
  const body = { monthly: reportMonthly, due: reportDue, herd: reportHerd }[S.reportTab];
  return `${tabs}<div id="report-panel" role="tabpanel" aria-labelledby="rt-${S.reportTab}" class="grid" style="gap:20px">${body()}</div>`;
}
function afterReports() {
  const sel = $('#rep-month');
  if (sel) sel.addEventListener('change', () => { S.reportMonth = sel.value; renderView(); });
}

/* monthly AVS summary */
function monthKeyOf(v) {
  if (!v) return '';
  const s = String(v).trim();
  const d = parseDate(s);
  if (d) return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  const m = s.match(/([A-Za-z]{3,})\w*[\s,-]+(\d{4})/);
  if (m) { const i = MON.findIndex(x => x.toLowerCase() === m[1].slice(0, 3).toLowerCase()); if (i >= 0) return `${m[2]}-${pad(i + 1)}`; }
  const n = s.match(/^(\d{4})[-/](\d{1,2})$/);
  return n ? `${n[1]}-${pad(+n[2])}` : '';
}
function monthChoices() {
  const out = [];
  for (let i = 0; i < 13; i++) { const d = addMonths(new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1)), -i); out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`); }
  return out;
}
const monthLabel = key => { const [y, m] = key.split('-').map(Number); return `${MONTH[m - 1]} ${y}`; };
function defaultMonth() {
  const prev = addMonths(new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1)), -1);
  return TODAY.getUTCDate() <= 20 ? `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}` : `${TODAY.getUTCFullYear()}-${pad(TODAY.getUTCMonth() + 1)}`;
}
function monthReport(key) {
  const [y, m] = key.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)), end = new Date(Date.UTC(y, m, 0));
  const inM = d => d && d >= start && d <= end;
  const rowsIn = (tab, field) => { const t = S.db[tab]; if (!t) return []; return t.rows.map(r => ({ t, r, d: parseDate(cell(t, r, field)) })).filter(x => inM(x.d)).sort((a, b) => a.d - b.d); };
  const dogOf = chip => { const d = BYCHIP.get(normChip(chip)); return d ? dogLabel(d) : normChip(chip) || '—'; };
  const g = (x, h) => cell(x.t, x.r, h);
  const litters = rowsIn('Puppies Bred In-House', 'Litter DOB');
  const puppies = litters.reduce((n, x) => n + (parseFloat(g(x, 'No. of Puppies')) || 0), 0);
  const vacc = rowsIn('Vaccinations', 'Date Given');
  const vaccTypes = {};
  vacc.forEach(x => { const k = g(x, 'Vaccine Type') || 'Not stated'; vaccTypes[k] = (vaccTypes[k] || 0) + 1; });
  const para = rowsIn('Parasite Treatments', 'Date');
  const paraTypes = {};
  para.forEach(x => { const k = g(x, 'Treatment Type') || 'Not stated'; paraTypes[k] = (paraTypes[k] || 0) + 1; });
  const bdIn = rowsIn('Breeding Dog Movement', 'Date In'), bdOut = rowsIn('Breeding Dog Movement', 'Date Out');
  const rpIn = rowsIn('Retail Puppy Movement', 'Date In'), rpOut = rowsIn('Retail Puppy Movement', 'Date Out');
  const visits = rowsIn('Visitor Log', 'Date').length + rowsIn('Form_Responses', 'Timestamp').length;
  const sub = S.db['AVS Submissions'] ? S.db['AVS Submissions'].rows.filter(r => monthKeyOf(cell(S.db['AVS Submissions'], r, 'Month')) === key) : [];
  return {
    key, label: monthLabel(key), start, end, sub,
    tiles: [['Litters born', litters.length], ['Puppies born', puppies], ['Matings', rowsIn('Mating Records', 'Date of Mating').length], ['Dogs in', bdIn.length + rpIn.length], ['Dogs out', bdOut.length + rpOut.length], ['Deaths', rowsIn('Deaths', 'Date of Death').length]],
    sections: [
      { title: 'Litters born', cols: ['Date', 'Dam', 'Sire', 'Puppies', 'Sexes', 'Delivery'], rows: litters.map(x => [dmy(x.d), dogOf(g(x, 'Dam Microchip')), dogOf(g(x, 'Sire Microchip')), g(x, 'No. of Puppies'), g(x, 'Sex Breakdown'), g(x, 'Delivery Method')]) },
      { title: 'Matings', cols: ['Date', 'Dam', 'Sire', 'Successful'], rows: rowsIn('Mating Records', 'Date of Mating').map(x => [dmy(x.d), dogOf(g(x, 'Dam Microchip')), g(x, 'Sire #1 Name') || dogOf(g(x, 'Sire #1 Microchip')), g(x, 'Successful')]) },
      { title: 'Breeding dogs in', cols: ['Date', 'Dog', 'Breed', 'Source'], rows: bdIn.map(x => [dmy(x.d), dogOf(g(x, 'Microchip No.')), g(x, 'Breed'), g(x, 'Source')]) },
      { title: 'Breeding dogs out', cols: ['Date', 'Dog', 'Breed', 'Reason'], rows: bdOut.map(x => [dmy(x.d), dogOf(g(x, 'Microchip No.')), g(x, 'Breed'), g(x, 'Reason')]) },
      { title: 'Retail puppies in', cols: ['Date', 'Microchip', 'Breed', 'Source'], rows: rpIn.map(x => [dmy(x.d), normChip(g(x, 'Microchip No.')), g(x, 'Breed'), [g(x, 'Source Type'), g(x, 'Source Name / Country')].filter(Boolean).join(' · ')]) },
      { title: 'Retail puppies out', cols: ['Date', 'Microchip', 'Breed', 'Status'], rows: rpOut.map(x => [dmy(x.d), normChip(g(x, 'Microchip No.')), g(x, 'Breed'), g(x, 'Status')]) },
      { title: 'Deaths', cols: ['Date', 'Dog', 'Cause', 'Vet confirmed'], rows: rowsIn('Deaths', 'Date of Death').map(x => [dmy(x.d), g(x, 'Dog Name') || dogOf(g(x, 'Microchip No.')), g(x, 'Cause of Death'), fmtVal(g(x, 'Vet Confirmation'), 'yesno')]) },
      { title: 'Sterilisations', cols: ['Date', 'Dog', 'Reason', 'Clinic'], rows: rowsIn('Sterilisations', 'Procedure Date').map(x => [dmy(x.d), g(x, 'Dog Name') || dogOf(g(x, 'Microchip No.')), g(x, 'Reason'), g(x, 'Clinic')]) },
      { title: 'Vet treatments', cols: ['Date', 'Dog', 'Treatment', 'Clinic'], rows: rowsIn('Veterinary Treatments', 'Date').map(x => [dmy(x.d), g(x, 'Dog Name') || dogOf(g(x, 'Microchip No.')), g(x, 'Treatment Provided'), g(x, 'Vet Clinic')]) },
      { title: 'Vaccinations', cols: ['Vaccine', 'Doses'], rows: Object.entries(vaccTypes).map(([k, n]) => [k, n]) },
      { title: 'Parasite treatments', cols: ['Treatment', 'Doses'], rows: Object.entries(paraTypes).map(([k, n]) => [k, n]) },
      { title: 'Annual health checks', cols: ['Date', 'Dog', 'Fit for breeding', 'Vet'], rows: rowsIn('Annual Health Checks', 'Exam Date').map(x => [dmy(x.d), g(x, 'Registered Name') || dogOf(g(x, 'Microchip No.')), fmtVal(g(x, 'Fit for Breeding'), 'yesno'), g(x, 'Vet Name')]) },
    ],
    extra: [['Active dogs on record today', DOGS.filter(isActive).length], ['Visitors this month', visits]],
  };
}
function reportTable(sec) {
  if (!sec.rows.length) return `<p class="muted none">None this month.</p>`;
  return `<div class="table-wrap flat"><table><thead><tr>${sec.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${sec.rows.map(r => `<tr>${r.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function reportMonthly() {
  const key = S.reportMonth || defaultMonth();
  S.reportMonth = key;
  const R = monthReport(key);
  const subT = S.db['AVS Submissions'];
  const subLine = R.sub.length ? `<span class="pill ok">${icon('check')}Submitted ${esc(fmtVal(cell(subT, R.sub[0], 'Date Submitted'), 'date'))}${cell(subT, R.sub[0], 'Submitted By') ? ' by ' + esc(cell(subT, R.sub[0], 'Submitted By')) : ''}</span>` : '<span class="pill warn">Not marked as submitted</span>';
  return `
  <div class="toolbar">
    <label for="rep-month" class="lbl-inline">Month</label>
    <select class="sel" id="rep-month">${monthChoices().map(k => `<option value="${k}" ${k === key ? 'selected' : ''}>${monthLabel(k)}</option>`).join('')}</select>
    ${subLine}
    <span class="spacer"></span>
    <button class="btn" data-action="pdf-month">${icon('pdf')}Save as PDF</button>
    ${R.sub.length ? '' : `<button class="btn primary" data-action="mark-submitted">${icon('check')}Mark as submitted</button>`}
  </div>
  <div class="note">${icon('info')}<span>This summary is built from your records to help you fill in the monthly submission. Check it against AVS’s current requirements before you send it.</span></div>
  <div class="tiles">${R.tiles.map(([l, n]) => `<div class="tile"><b>${n}</b><span>${esc(l)}</span></div>`).join('')}</div>
  <div class="report-secs">${R.sections.map(s => `<section class="panel"><div class="panel-h"><h2>${esc(s.title)}</h2><span class="aside">${s.rows.length || ''}</span></div><div class="panel-b">${reportTable(s)}</div></section>`).join('')}</div>
  <p class="muted small">${R.extra.map(([l, n]) => `${esc(l)}: <b>${n}</b>`).join(' · ')}</p>`;
}
function markSubmitted() {
  const key = S.reportMonth || defaultMonth();
  openForm({ tab: 'AVS Submissions', mode: 'new', preset: { values: { 'Month': monthLabel(key), 'Date Submitted': isoD(TODAY), 'Submitted By': S.prefs.who || '', 'Attachments': `Monthly report ${monthLabel(key)} (PDF)` } } });
}

/* due list */
function reportDue() {
  const up = upcoming(60);
  return `<div class="toolbar"><p class="lede" style="margin:0">Everything overdue (up to 30 days) and due in the next 60 days.</p><span class="spacer"></span><button class="btn" data-action="pdf-due">${icon('pdf')}Save as PDF</button></div>
    <section class="panel"><div class="list">${up.length ? up.map(dueRow).join('') : '<div class="panel-b muted">Nothing is due.</div>'}</div></section>`;
}

/* herd summary */
function barsHTML(entries) {
  const max = entries.length ? Math.max(...entries.map(e => e[1])) : 1;
  return `<div class="bars">${entries.map(([b, n]) => `<div class="bar-row"><span class="lbl" title="${esc(b)}">${esc(b)}</span><span class="bar-track" aria-hidden="true"><span class="bar-fill" style="display:block;width:${Math.max(3, n / max * 100).toFixed(1)}%"></span></span><span class="v">${n}</span></div>`).join('')}</div>`;
}
function reportHerd() {
  const active = DOGS.filter(isActive);
  const count = (list, fn) => { const o = {}; list.forEach(d => { const k = fn(d); o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]); };
  const band = d => { const m = ageMonths(d.dob); return m == null ? 'Unknown age' : m < 12 ? 'Under 1 year' : m < 60 ? '1 to 4 years' : m < 96 ? '5 to 7 years' : '8 years and over'; };
  return `<div class="grid g2">
    <section class="panel"><div class="panel-h"><h2>Active dogs by breed</h2><span class="aside">${active.length}</span></div><div class="panel-b">${barsHTML(count(active, d => titleCase(d.breed || 'Unknown')))}</div></section>
    <section class="panel"><div class="panel-h"><h2>By age</h2></div><div class="panel-b">${barsHTML(['Under 1 year', '1 to 4 years', '5 to 7 years', '8 years and over', 'Unknown age'].map(k => [k, active.filter(d => band(d) === k).length]).filter(e => e[1]))}</div>
      <div class="panel-h"><h2>By sex</h2></div><div class="panel-b">${barsHTML(count(active, d => sexWord(d.sex) || 'Not recorded'))}</div></section>
    <section class="panel"><div class="panel-h"><h2>By premise</h2></div><div class="panel-b">${barsHTML(count(active, d => d.premise || 'Not recorded'))}</div></section>
    <section class="panel"><div class="panel-h"><h2>All records by status</h2><span class="aside">${DOGS.length}</span></div><div class="panel-b">${barsHTML(count(DOGS, d => d.status || 'No status'))}</div></section>
  </div>`;
}
