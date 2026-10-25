/* ───────── printable documents (saved as PDF) ───────── */
const PDF_CSS = `
@page{size:A4;margin:16mm 14mm}
*{box-sizing:border-box}
body{margin:0;font-family:"Nunito Sans","Segoe UI",Arial,sans-serif;font-size:10.5pt;line-height:1.45;color:#22261F}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #4E7D5B;padding-bottom:8px;margin-bottom:14px}
.top .farm b{display:block;font-size:13pt}
.top .farm span,.top .gen{color:#5C6358;font-size:9pt}
h1{font-size:19pt;margin:0 0 4px}
h2{font-size:12pt;margin:18px 0 6px;color:#3F6A4B;border-bottom:1px solid #DDE3D6;padding-bottom:3px}
.lede{color:#5C6358;margin:0 0 10px}
table{width:100%;border-collapse:collapse;margin:2px 0 4px;page-break-inside:auto}
tr{page-break-inside:avoid}
th,td{text-align:left;padding:5px 7px;border-bottom:1px solid #E3E7DD;vertical-align:top}
th{background:#F0F3EC;font-size:9pt;color:#4A5146}
.kv{display:grid;grid-template-columns:150px 1fr;gap:4px 14px;margin:0}
.kv dt{color:#5C6358}.kv dd{margin:0}
.idrow{display:flex;gap:18px;align-items:flex-start}
.idrow .photo{width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #DDE3D6}
.chip{font-family:"IBM Plex Mono",Consolas,monospace;letter-spacing:.04em}
.none{color:#7A8176;font-style:italic;margin:2px 0 6px}
.tiles{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:10px 0}
.tile{border:1px solid #DDE3D6;border-radius:6px;padding:6px 8px}.tile b{display:block;font-size:16pt}.tile span{font-size:8.5pt;color:#5C6358}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:34px}
.sign div{border-top:1px solid #22261F;padding-top:4px;font-size:9pt;color:#5C6358}
.box{display:inline-block;width:12px;height:12px;border:1.5px solid #22261F;border-radius:2px}
.foot{margin-top:24px;color:#7A8176;font-size:8.5pt}
`;
function pdfDoc(title, body, sub = '') {
  const farm = farmInfo('Farm Name') || 'K-9 Salon';
  const lic = farmInfo('Licence Number');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>/*FONTS*/${PDF_CSS}</style></head><body>
  <div class="top"><div class="farm"><b>${esc(farm)}</b>${lic ? `<span>Licence ${esc(lic)}</span>` : ''}</div><div class="gen">Prepared ${longD(TODAY)}</div></div>
  <h1>${esc(title)}</h1>${sub ? `<p class="lede">${sub}</p>` : ''}${body}</body></html>`;
}
function pdfTable(cols, rows, empty = 'None recorded.') {
  if (!rows.length) return `<p class="none">${esc(empty)}</p>`;
  return `<table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(v => `<td>${esc(v == null ? '' : v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
async function savePdf(title, filename, body, sub) {
  toast('Preparing the PDF…');
  const res = await window.k9.pdf({ html: pdfDoc(title, body, sub), filename: filename.replace(/[\\/:*?"<>|]+/g, '-') }).catch(e => ({ ok: false, message: String(e.message || e) }));
  if (res && res.ok && res.blob) offerFile(res.blob, res.name, 'Your PDF is ready'); // the phone version hands the file over to share or save
  else if (res && res.ok) toast(`Saved ${res.name}. It’s open in your PDF viewer.`);
  else if (!res || !res.cancelled) toast(`Couldn’t make the PDF: ${(res && res.message) || 'unknown error'}`, true);
}

async function pdfDog(chip, id) {
  const d = findDog(chip, id);
  if (!d) return;
  const rows = (tab, cols) => evsFor(d.chip, tab).slice().reverse().map(e => cols.map(h => typeof h === 'function' ? h(e) : fmtVal(cell(e.t, e.row, h), kindOf(h, tab))));
  const dam = d.dam && BYCHIP.get(d.dam), sire = d.sire && BYCHIP.get(d.sire);
  const parent = (chipNo, p) => !chipNo ? '—' : p ? `${dogName(p)} · ${titleCase(p.breed)} · ${chipNo}` : chipNo;
  const photo = S.photos[d.key] ? await photoURL(d.key) : null;
  const vet = e => [cell(e.t, e.row, 'Administering Vet'), cell(e.t, e.row, 'Clinic')].filter(Boolean).join(', ');
  const ahc = evsFor(d.chip, 'Annual Health Checks')[0];
  const daily = evsFor(d.chip, 'Daily Health Monitoring').slice(0, 5);
  const ster = evsFor(d.chip, 'Sterilisations')[0];
  const body = `
  <div class="idrow">${photo ? `<img class="photo" src="${esc(photo)}" alt="">` : ''}<dl class="kv" style="flex:1">
    <dt>Name</dt><dd>${esc(dogName(d))}</dd><dt>Animal ID</dt><dd>${esc(d.id || '—')}</dd>
    <dt>Microchip</dt><dd class="chip">${esc(d.chip || 'Not recorded')}</dd><dt>Breed</dt><dd>${esc(titleCase(d.breed))}</dd>
    <dt>Sex</dt><dd>${esc(sexWord(d.sex))}</dd><dt>Colour</dt><dd>${esc(titleCase(d.colour) || '—')}</dd>
    <dt>Date of birth</dt><dd>${d.dob ? `${longD(d.dob)} (${esc(ageText(d.dob))})` : '—'}</dd><dt>Sterilised</dt><dd>${esc(fmtVal(d.sterilised, 'yesno') || (ster ? 'Yes' : 'No record'))}</dd>
  </dl></div>
  <h2>Parents</h2><dl class="kv"><dt>Dam</dt><dd>${esc(parent(d.dam, dam))}</dd><dt>Sire</dt><dd>${esc(parent(d.sire, sire))}</dd></dl>
  <h2>Vaccinations</h2>${pdfTable(['Date given', 'Vaccine', 'Batch no.', 'Vet / clinic', 'Next due'], rows('Vaccinations', ['Date Given', 'Vaccine Type', 'Batch No.', vet, 'Next Due Date']), 'No vaccinations recorded.')}
  <h2>Parasite treatments</h2>${pdfTable(['Date', 'Treatment', 'Product', 'Dose', 'Next due'], rows('Parasite Treatments', ['Date', 'Treatment Type', 'Product Name', 'Dosage', 'Next Due Date']), 'No parasite treatments recorded.')}
  <h2>Vet treatments</h2>${pdfTable(['Date', 'Treatment', 'Clinic'], rows('Veterinary Treatments', ['Date', 'Treatment Provided', 'Vet Clinic']), 'No vet treatments recorded.')}
  <h2>Health checks</h2>${ahc ? `<p>Annual check on <b>${esc(dmy(ahc.date))}</b>: ${esc(cell(ahc.t, ahc.row, 'General Condition') || 'see record')}${cell(ahc.t, ahc.row, 'Vet Name') ? ', by ' + esc(cell(ahc.t, ahc.row, 'Vet Name')) : ''}.</p>` : ''}
  ${pdfTable(['Date', 'General', 'Remarks'], daily.map(e => [dmy(e.date), cell(e.t, e.row, 'General'), cell(e.t, e.row, 'Remarks')]), 'No health checks recorded.')}
  ${docsFor(d).length ? `<h2>Documents on file</h2>${pdfTable(['Document', 'Date', 'Country', 'Notes'], docsFor(d).slice().sort(docSort).map(x => [x.type, docWhen(x), x.country, x.note]))}` : ''}
  ${ster ? `<h2>Sterilisation</h2><p>${esc(dmy(ster.date))}${cell(ster.t, ster.row, 'Clinic') ? ' at ' + esc(cell(ster.t, ster.row, 'Clinic')) : ''}${cell(ster.t, ster.row, 'Certificate No.') ? ' · certificate ' + esc(cell(ster.t, ster.row, 'Certificate No.')) : ''}</p>` : ''}
  <div class="sign"><div>Breeder’s signature and date</div><div>Owner’s signature and date</div></div>
  <p class="foot">This record lists the treatments entered in the breeder’s kennel records up to the date above.</p>`;
  savePdf(`Health record: ${dogName(d)}`, `Health record ${dogName(d)} ${d.id || ''} ${isoD(TODAY)}.pdf`, body);
}
function pdfMonth() {
  const R = monthReport(S.reportMonth || defaultMonth());
  const body = `<div class="tiles">${R.tiles.map(([l, n]) => `<div class="tile"><b>${n}</b><span>${esc(l)}</span></div>`).join('')}</div>
    ${R.sections.map(s => `<h2>${esc(s.title)}</h2>${pdfTable(s.cols, s.rows, 'None this month.')}`).join('')}
    <p class="foot">${R.extra.map(([l, n]) => `${esc(l)}: ${n}`).join(' · ')}. Built from the farm’s records; check against AVS’s current requirements before submitting.</p>`;
  savePdf(`Monthly summary: ${R.label}`, `AVS monthly summary ${R.label}.pdf`, body, `${dmy(R.start)} to ${dmy(R.end)}`);
}
function pdfDue() {
  const up = upcoming(60);
  const body = pdfTable(['Done', 'Date', 'What', 'Dog or person', 'Notes'], up.map(u => ['__BOX__', `${dmy(u.date)}${u.days < 0 ? ` (${-u.days} days late)` : ''}`, u.kind, u.title, u.sub || '']), 'Nothing is due.')
    .replace(/<td>__BOX__<\/td>/g, '<td><span class="box"></span></td>');
  savePdf('Due list', `Due list ${isoD(TODAY)}.pdf`, body, 'Overdue items (up to 30 days) and everything due in the next 60 days.');
}
