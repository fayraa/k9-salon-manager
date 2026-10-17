/* ───────── dog profile drawer ───────── */
let drawerDog = null;
function openDog(chip, id) {
  const d = findDog(chip, id);
  if (!d) { toast(chip ? `No dog with microchip ${chip}` : 'Dog not found', true); return; }
  drawerDog = { chip: d.chip, id: d.id };
  const existing = OV.find(o => o.kind === 'dog');
  if (existing) { existing.el.querySelector('.drawer').innerHTML = drawerHTML(d); loadDrawerPhoto(d); return; }
  pushOverlay('dog', `<aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(dogName(d))}">${drawerHTML(d)}</aside>`, { onClose: () => { drawerDog = null; } });
  loadDrawerPhoto(d);
}
function refreshDrawer() {
  const o = OV.find(x => x.kind === 'dog');
  if (!o || !drawerDog) return;
  const d = findDog(drawerDog.chip, drawerDog.id);
  if (d) { o.el.querySelector('.drawer').innerHTML = drawerHTML(d); loadDrawerPhoto(d); }
}
function drawerHTML(d) {
  const ci = chipInfo(d.chip);
  const vd = vaccDue(d);
  const lastAHC = (evsFor(d.chip, 'Annual Health Checks')[0] || {}).date;
  const dam = d.dam && BYCHIP.get(d.dam), sire = d.sire && BYCHIP.get(d.sire);
  const kids = DOGS.filter(x => d.chip && (x.dam === d.chip || x.sire === d.chip));
  const parentHTML = (chip, p) => !chip ? '<span class="muted">—</span>' : p ? `<button class="linkbtn" data-action="open-dog" data-chip="${esc(chip)}">${esc(dogName(p))}</button>` : chipHTML(chip);
  const facts = [
    ['Breed', titleCase(d.breed)], ['Colour', titleCase(d.colour)], ['Sex', sexWord(d.sex)],
    ['Date of birth', d.dob ? `${dmy(d.dob)} (${ageText(d.dob)})` : ''], ['Premise', d.premise], ['Kennel', d.kennel], ['Sterilised', fmtVal(d.sterilised, 'yesno')],
    ['Source', d.source], ['Licence no.', d.pals], ['Licence expiry', d.palsExp ? dmy(d.palsExp) : ''],
  ].map(([k, v]) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="muted">—</span>'}</dd>`).join('')
    + `<dt>Dam</dt><dd>${parentHTML(d.dam, dam)}</dd><dt>Sire</dt><dd>${parentHTML(d.sire, sire)}</dd>`
    + (d.remarks ? `<dt>Remarks</dt><dd>${esc(d.remarks)}</dd>` : '');
  const checks = [];
  const C = S.shared.checks;
  const iss = k => d.issues.filter(i => i.k === k);
  const chk = (k, okText) => { const x = iss(k); if (x.length) x.forEach(i => checks.push([i.sev, i.text])); else if (okText) checks.push(['ok', okText]); };
  if (C.licence) chk('licence', d.pals ? `Licence ${d.pals}${d.palsExp ? ', expires ' + dmy(d.palsExp) : ''}` : null);
  if (C.healthcheck) chk('healthcheck', lastAHC ? `Annual health check on ${dmy(lastAHC)}` : null);
  chk('vacc', vd ? `Next vaccination due ${dmy(vd)}` : null);
  if (!vd && isActive(d)) checks.push(['na', 'No vaccination due date recorded']);
  chk('parasite', null); chk('breeding', null); chk('sterilise', null); chk('deceased', null); chk('chip', null); chk('papers', null);
  const isF = isFemale(d);
  const b = isF ? breedInfo(d) : null;
  const flags = isF ? breedingFlags(d, b) : [];
  const crit = flags.filter(f => f.sev === 'crit');
  const tl = (d.chip ? (IDX.byChip.get(d.chip) || []).map(x => x.ev) : []).filter((e, i, a) => a.indexOf(e) === i).sort((a, b2) => (b2.date || 0) - (a.date || 0));
  const qa = [['Vaccinations', 'Vaccination'], ['Parasite Treatments', 'Parasite treatment'], ['Daily Health Monitoring', 'Daily check'], ['Veterinary Treatments', 'Vet treatment'], ['Annual Health Checks', 'Annual check']];
  if (isF) qa.push(['Heat Cycles', 'Heat cycle'], ['Mating Records', 'Mating']);
  qa.push(['Breeding Dog Movement', 'Movement'], ['Sterilisations', 'Sterilisation'], ['Deaths', 'Death']);
  // a record has a document when its link column holds one of the dog's documents; tabs with no link column use the row noted at upload
  const myDocs = docsFor(d), docUrls = new Set(myDocs.map(x => docUrl(x.id)));
  const docRows = new Set(myDocs.filter(x => x.tab && x.row).map(x => `${x.tab}|${x.row}`));
  const hasDoc = e => e.row.v.some(v => docUrls.has(String(v).trim())) || (docRows.has(`${e.L.tab}|${e.row.r}`) && !e.t.headers.some(h => /link$/i.test(h)));
  const photo = S.photos[d.key];
  const canPhoto = S.bridgeVersion >= NEED_BRIDGE && d.key;
  return `
  <div class="dr-h">
    <div class="ph" id="dr-photo" data-key="${esc(d.key)}">${photo ? '<span class="ph-load" aria-hidden="true"></span>' : icon('paw')}</div>
    <div style="flex:1;min-width:0"><span class="eyebrow">${esc(d.id || 'No ID')} · row ${d.row.r} of All Breeds</span><h2>${esc(dogName(d))}</h2><div class="sub">${statusPill(d.status)} ${esc(titleCase(d.breed))}${d.dob ? ' · ' + esc(ageText(d.dob)) : ''}</div></div>
    <button class="iconbtn" data-action="close-top" aria-label="Close profile">${icon('x')}</button>
  </div>
  <div class="dr-b">
    <div class="dr-actions">
      <button class="btn" data-action="edit-dog" data-r="${d.row.r}">${icon('edit')}Edit details</button>
      <button class="btn" data-action="pdf-dog" data-chip="${esc(d.chip)}" data-id="${esc(d.id)}">${icon('pdf')}Health record (PDF)</button>
      ${canPhoto ? `<label class="btn" for="photo-in">${icon('camera')}${photo ? 'Change photo' : 'Add photo'}</label><input type="file" id="photo-in" accept="image/jpeg,image/png,image/webp" class="sr" data-key="${esc(d.key)}">` : ''}
      ${isF && S.bridgeVersion >= NEED_BRIDGE ? `<button class="btn" data-action="litter" data-chip="${esc(d.chip)}">${icon('litter')}Record a litter</button>` : ''}
    </div>
    <div class="chipcard"><span class="eyebrow">Microchip</span><div class="big">${d.chip.length === 15 ? `<span><span class="cc">${d.chip.slice(0, 3)}</span>${d.chip.slice(3)}</span>` : `<span>${esc(d.chip || 'Not recorded')}</span>`}${d.chip ? `<button class="iconbtn" data-action="copy" data-copy="${esc(d.chip)}" aria-label="Copy microchip number">${icon('copy')}</button>` : ''}</div><small class="${ci.bad ? 'warn-t' : ''}">${esc(ci.text)}</small></div>
    <section class="sec" aria-labelledby="dr-todo"><h3 id="dr-todo">To do</h3><div class="checks">${checks.length ? checks.map(([s, t]) => `<div class="check"><span class="sw ${s}" aria-hidden="true"></span><span>${s === 'crit' ? '<span class="sr">Needs action: </span>' : s === 'warn' ? '<span class="sr">Coming up: </span>' : ''}${esc(t)}</span></div>`).join('') : '<div class="check"><span class="sw ok" aria-hidden="true"></span><span>Nothing to do</span></div>'}</div></section>
    ${docsSectionHTML(d)}
    ${b ? `<section class="sec" aria-labelledby="dr-breed"><h3 id="dr-breed">Breeding</h3><dl class="kv">
      <dt>Eligibility</dt><dd>${crit.length ? `<b class="crit-t">Not eligible</b> · ${esc(crit.map(f => f.text).join('; '))}` : flags.length ? `<b class="warn-t">Check</b> · ${esc(flags.map(f => f.text).join('; '))}` : 'Eligible under your rules'}</dd>
      <dt>Now</dt><dd>${b.expecting ? `Expecting · day ${b.expecting.since}, due around ${longD(b.expecting.due)}` : 'Open'}</dd>
      <dt>Matings</dt><dd>${b.matYr} this year · ${b.matLife} in total</dd>
      <dt>Litters</dt><dd>${b.litters}${b.litters12 ? ` (${b.litters12} in the last 12 months)` : ''}${b.csec ? ` · ${plural(b.csec, 'C-section')}` : ''}${b.lastWhelp ? ` · last ${dmy(b.lastWhelp)}` : ''}</dd>
      <dt>Heat</dt><dd>${b.lastHeat ? `Last ${dmy(b.lastHeat)}` : 'None recorded'}${b.nextHeat ? ` · next around ${dmy(b.nextHeat)}` : ''}</dd></dl></section>` : ''}
    <section class="sec" aria-labelledby="dr-log"><h3 id="dr-log">Log a record</h3><div class="qa">${qa.filter(([tab]) => S.db[tab]).map(([tab, l]) => `<button class="btn sm" data-action="new-entry" data-tab="${esc(tab)}" data-chip="${esc(d.chip)}">${icon('plus')}${esc(l)}</button>`).join('')}</div></section>
    <section class="sec" aria-labelledby="dr-det"><h3 id="dr-det">Details</h3><dl class="kv">${facts}</dl></section>
    ${kids.length ? `<section class="sec" aria-labelledby="dr-kids"><h3 id="dr-kids">Offspring on record · ${kids.length}</h3><div class="qa">${kids.slice(0, 40).map(k => `<button class="btn sm ghost" data-action="open-dog" data-chip="${esc(k.chip)}" data-id="${esc(k.id)}">${esc(dogName(k))}</button>`).join('')}</div></section>` : ''}
    <section class="sec" aria-labelledby="dr-hist"><h3 id="dr-hist">History · ${tl.length}</h3>${tl.length ? `<div class="tl">${tl.slice(0, 60).map(e => `<button data-action="edit-row" data-tab="${esc(e.L.tab)}" data-r="${e.row.r}"><span class="d">${e.date ? dmy(e.date) : '—'}</span><span style="min-width:0"><b>${esc(cap(e.L.noun))}</b>${hasDoc(e) ? `<span class="clip" title="Has a document">${icon('clip')}<span class="sr">, has a document</span></span>` : ''}<small>${esc(eventSummary(e))}</small></span></button>`).join('')}</div>` : `<p class="muted" style="margin:0">${d.chip ? 'No records for this microchip yet. Use the buttons above to log one.' : 'Add a microchip number to link records to this dog.'}</p>`}</section>
  </div>`;
}

/* photos */
const PHOTO_CACHE = new Map();
async function photoURL(key) {
  const p = S.photos[key];
  if (!p) return null;
  if (PHOTO_CACHE.has(p.id)) return PHOTO_CACHE.get(p.id);
  const res = await window.k9.photo(p.id).catch(() => null);
  if (!res || !res.ok) return null;
  PHOTO_CACHE.set(p.id, res.url);
  return res.url;
}
async function loadDrawerPhoto(d) {
  if (!S.photos[d.key]) return;
  const url = await photoURL(d.key);
  const box = $('#dr-photo');
  if (!box || box.dataset.key !== d.key) return;
  box.innerHTML = url ? `<img src="${esc(url)}" alt="Photo of ${esc(dogName(d))}">` : icon('paw');
}
function resizeImage(file, max = 1280, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality)); // re-encoding also drops the photo's location data
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file isn’t a picture the app can read.')); };
    img.src = url;
  });
}
async function uploadPhoto(input) {
  const file = input.files && input.files[0];
  const key = input.dataset.key;
  const d = DOGS.find(x => x.key === key);
  if (!file || !d) return;
  if (file.size > 25e6) { toast('That photo is over 25 MB. Choose a smaller one.', true); return; }
  toast('Uploading photo…');
  try {
    const dataUrl = await resizeImage(file);
    const res = await deskCall({ action: 'photo_upload', dogKey: key, dogName: dogName(d), mime: 'image/jpeg', data: dataUrl.split(',')[1] });
    if (!res || !res.ok) throw userErr(deskText(res || {}));
    S.photos[key] = { id: res.id, at: res.at };
    PHOTO_CACHE.set(res.id, dataUrl);
    toast(`Photo saved for ${dogName(d)}`);
    refreshDrawer();
  } catch (e) { toast(e.userMessage || e.message || 'Couldn’t upload the photo.', true); }
}
