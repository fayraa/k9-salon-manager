/* ───────── documents: scans and PDFs of a dog's records, kept in Google Drive ───────── */
const DOC_MAX_CHARS = 14000000; // what the bridge accepts: about 10 MB once decoded
const DOC_KINDS = [
  { t: 'Vaccination record', tab: 'Vaccinations' },
  { t: 'Health certificate', tab: 'Annual Health Checks' },
  { t: 'Vet report', tab: 'Veterinary Treatments' },
  { t: 'Sterilisation certificate', tab: 'Sterilisations' },
  { t: 'Death certificate', tab: 'Death Certificates' },
  { t: 'Licence' },
  { t: 'Pedigree or registration' },
  { t: 'Purchase or transfer', tab: 'Breeding Dog Movement' },
  { t: 'Other' },
  { t: 'Import permit', imp: true },
  { t: 'Export health certificate', imp: true, country: true },
  { t: 'Overseas vaccination record', imp: true, country: true, tab: 'Vaccinations' },
  { t: 'Rabies blood test', imp: true, country: true },
];
const IMPORT_PAPERS = ['Import permit', 'Export health certificate', 'Overseas vaccination record'];
const ORIGINS = [[/thai/i, 'Thailand'], [/korea/i, 'South Korea'], [/taiwan/i, 'Taiwan'], [/japan/i, 'Japan'], [/china|chinese/i, 'China'], [/malaysia/i, 'Malaysia'], [/philippin/i, 'Philippines'], [/indonesia/i, 'Indonesia'], [/vietnam/i, 'Vietnam'], [/hong ?kong/i, 'Hong Kong'], [/australia/i, 'Australia'], [/russia/i, 'Russia'], [/\bu\.?k\b|united kingdom|britain|england/i, 'United Kingdom'], [/\bu\.?s\.?a?\b|united states|america/i, 'United States']];
const kindOfDoc = t => DOC_KINDS.find(k => k.t === t) || { t };
const isImported = d => /\b(impt|imp|import(ed)?|overseas)\b/i.test(d.source || '');
/** Where an imported dog came from: from the Source column, or the microchip's country code. */
function originOf(d) {
  const m = ORIGINS.find(([re]) => re.test(d.source || ''));
  if (m) return m[1];
  const cc = CC[String(d.chip || '').slice(0, 3)];
  return isImported(d) && cc && cc !== 'Singapore' ? cc : '';
}
/** A dog's documents: matched by microchip when both have one (as photos are), otherwise by animal ID. */
function docsFor(d) {
  const id = String(d.id || '').trim();
  return (S.docs || []).filter(x => (x.chip && d.chip ? x.chip === d.chip : !!(x.aid && id && String(x.aid).trim() === id)));
}
const docUrl = id => `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
const docSort = (a, b) => String(b.date || b.added).localeCompare(String(a.date || a.added));
const docWhen = x => (x.date ? dmy(parseDate(x.date)) : '');

function docsSectionHTML(d) {
  const list = docsFor(d).slice().sort(docSort);
  const can = S.bridgeVersion >= DOC_BRIDGE;
  const key = `data-chip="${esc(d.chip)}" data-id="${esc(d.id)}"`;
  let papers = '';
  if (isImported(d)) {
    const have = new Map();
    list.forEach(x => { if (!have.has(x.type)) have.set(x.type, x); }); // newest of each kind
    const from = originOf(d);
    papers = `<div class="papers"><span class="eyebrow">Import papers${from ? ` · from ${esc(from)}` : ''}</span>${IMPORT_PAPERS.map(t => { const x = have.get(t); return `<div class="check"><span class="sw ${x ? 'ok' : 'na'}" aria-hidden="true"></span><span>${esc(t)}${x ? ` <span class="muted">· on file${docWhen(x) ? ', ' + esc(docWhen(x)) : ''}</span>` : can ? ` <span class="muted">· not added yet ·</span> <button class="linkbtn" data-action="doc-add" ${key} data-type="${esc(t)}">Add<span class="sr"> ${esc(t.toLowerCase())}</span></button>` : ' <span class="muted">· not added yet</span>'}</span></div>`; }).join('')}</div>`;
  }
  const rows = list.map(x => {
    const L = LOG[x.tab];
    const sub = [docWhen(x), x.country, x.note, L ? `with the ${L.noun}` : ''].filter(Boolean).join(' · ');
    return `<li class="doc"><span class="doc-ic" aria-hidden="true">${icon(x.mime === 'application/pdf' ? 'doc' : 'image')}</span><span class="doc-t"><b>${esc(x.type)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
      <button class="btn sm" data-action="doc-open" data-doc="${esc(x.id)}">Open<span class="sr"> ${esc(x.type.toLowerCase())}</span></button>
      <a class="iconbtn" href="${docUrl(x.id)}" target="_blank" rel="noopener" aria-label="Open ${esc(x.type.toLowerCase())} in Google Drive" title="Open in Google Drive">${icon('ext')}</a>
      ${can ? `<button class="iconbtn" data-action="doc-remove" data-doc="${esc(x.id)}" aria-label="Remove ${esc(x.type.toLowerCase())}" title="Remove">${icon('x')}</button>` : ''}</li>`;
  }).join('');
  return `<section class="sec" aria-labelledby="dr-docs"><h3 id="dr-docs">Documents · ${list.length}</h3>
    ${can ? '' : `<p class="note">${icon('info')}<span>Adding documents needs the newest bridge script. <button class="linkbtn" data-action="bridge-help">Update the bridge</button></span></p>`}
    ${S.docsError ? `<p class="note">${icon('info')}<span>The list of documents couldn’t be read. Check the hidden “App Documents” tab in your sheet hasn’t been changed.</span></p>` : ''}
    ${papers}
    ${list.length ? `<ul class="docs">${rows}</ul>` : `<p class="muted" style="margin:0">No documents yet. Add photos or PDFs of vaccination records, certificates and import papers.</p>`}
    ${can ? `<div class="row"><button class="btn sm" data-action="doc-add" ${key}>${icon('plus')}Add a document</button></div>` : ''}</section>`;
}

/* adding a document */
function openDocAdd(chip, id, type) {
  const d = findDog(chip, id);
  if (!d) return;
  if (needBridge('Adding documents', DOC_BRIDGE)) return;
  if (!d.id && !d.chip) { toast('Give this dog an animal ID or a microchip number first.', true); return; }
  const opt = k => `<option value="${esc(k.t)}" ${k.t === type ? 'selected' : ''}>${esc(k.t)}</option>`;
  const from = originOf(d);
  const o = modal('doc', {
    title: 'Add a document', form: true,
    sub: `For ${esc(dogLabel(d))}. Saved in your Google Drive, in the “K-9 Salon Dog Documents” folder.`,
    body: `<div class="form-grid">
      <div class="field"><label for="dc-type">What is it?</label><select class="sel" id="dc-type"><optgroup label="Records">${DOC_KINDS.filter(k => !k.imp).map(opt).join('')}</optgroup><optgroup label="Import papers">${DOC_KINDS.filter(k => k.imp).map(opt).join('')}</optgroup></select></div>
      <div class="field"><label for="dc-date">Date on the document</label><input class="inp" type="date" id="dc-date"><span class="hint">Leave blank if it has none.</span></div>
      <div class="field" id="dc-country-f"><label for="dc-country">Country it’s from</label><input class="inp" id="dc-country" list="dc-countries" value="${esc(from)}" autocomplete="off"><datalist id="dc-countries">${Array.from(new Set(ORIGINS.map(x => x[1]).concat(Object.values(CC)))).sort().map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></div>
      <div class="field" id="dc-link-f"><label for="dc-link">Goes with</label><select class="sel" id="dc-link"></select><span class="hint">Its link is added to that record in the sheet.</span></div>
      <div class="field wide"><label for="dc-note">Note</label><input class="inp" id="dc-note" maxlength="300" autocomplete="off" placeholder="For example: booster, page 2 of 3"></div>
      <div class="field wide"><span class="flabel" id="dc-file-l">File</span>
        <div class="drop" id="dc-drop"><span>Drop a PDF or photos here, or</span><label class="btn sm" for="dc-file">${icon('plus')}Choose files</label><input type="file" id="dc-file" class="sr" accept="application/pdf,image/jpeg,image/png,image/webp" multiple aria-labelledby="dc-file-l"></div>
        <div class="dc-files" id="dc-files" aria-live="polite"></div>
        <span class="hint">One PDF, or one or more photos. Several photos are saved together as one PDF, a page each.</span></div>
    </div>`,
    foot: `<span class="msg" id="dc-msg" aria-live="polite"></span><button type="button" class="btn" data-action="close-top">Cancel</button><button type="submit" class="btn primary" id="dc-save">Save document</button>`,
    guard: () => formGuard(o),
  });
  o.job = { tab: '', dirty: false, saving: false };
  o.docDog = { chip: d.chip, id: d.id };
  o.files = [];
  o.linkTouched = false;
  o.linkSeen = new Map();
  const form = $('form', o.el);
  const sync = () => {
    const k = kindOfDoc($('#dc-type', o.el).value);
    $('#dc-country-f', o.el).hidden = !k.country;
    const evs = k.tab && S.db[k.tab] && d.chip ? evsFor(d.chip, k.tab).slice(0, 50) : [];
    const sel = $('#dc-link', o.el);
    const want = sel.value;
    // each record as shown now, so the bridge can refuse the link if that row changes before saving
    evs.forEach(e => { const v = `${e.L.tab}|${e.row.r}`; if (!o.linkSeen.has(v)) o.linkSeen.set(v, rowExpect(e.t, e.row)); });
    sel.innerHTML = `<option value="">No particular record</option>${evs.map(e => `<option value="${esc(e.L.tab)}|${e.row.r}">${esc([e.date ? dmy(e.date) : 'No date', eventSummary(e)].filter(Boolean).join(' · ').slice(0, 90))}</option>`).join('')}`;
    if (want && Array.from(sel.options).some(x => x.value === want)) sel.value = want;
    $('#dc-link-f', o.el).hidden = !evs.length;
    o.linkEvents = evs;
    matchDate();
  };
  // a record with the same date as the document is picked for you, until you choose one yourself
  const matchDate = () => {
    if (o.linkTouched) return;
    const dt = parseDate($('#dc-date', o.el).value);
    const e = dt && (o.linkEvents || []).find(x => x.date && x.date.getTime() === dt.getTime());
    $('#dc-link', o.el).value = e ? `${e.L.tab}|${e.row.r}` : '';
  };
  $('#dc-type', o.el).addEventListener('change', sync);
  $('#dc-date', o.el).addEventListener('change', matchDate);
  $('#dc-link', o.el).addEventListener('change', () => { o.linkTouched = true; });
  form.addEventListener('input', () => { o.job.dirty = true; });
  $('#dc-file', o.el).addEventListener('change', e => { docPick(o, Array.from(e.target.files || [])); e.target.value = ''; });
  const drop = $('#dc-drop', o.el);
  ['dragenter', 'dragover'].forEach(ev => o.el.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => o.el.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' || !o.el.contains(e.relatedTarget)) drop.classList.remove('over'); }));
  o.el.addEventListener('drop', e => docPick(o, Array.from((e.dataTransfer && e.dataTransfer.files) || [])));
  o.el.addEventListener('click', e => { if (e.target.closest('[data-dc-clear]')) { o.files = []; o.prepared = null; docFiles(o); $('#dc-file', o.el).focus(); } });
  form.addEventListener('submit', e => { e.preventDefault(); submitDoc(o); });
  sync();
  docFiles(o);
}
const DOC_OK = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const fileSize = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
function docPick(o, files) {
  if (!files.length) return;
  const say = (t, bad) => { const m = $('#dc-msg', o.el); m.textContent = t; m.className = 'msg' + (bad ? ' err' : ''); };
  const bad = files.find(f => !DOC_OK.includes(f.type));
  if (bad) return say(`“${bad.name}” isn’t a PDF or a JPEG, PNG or WebP picture. Photos from an iPhone may need saving as JPEG first.`, true);
  const all = o.files.concat(files);
  const pdfs = all.filter(f => f.type === 'application/pdf');
  if (pdfs.length && all.length > 1) return say('Choose one PDF on its own, or photos. To add another PDF, save this one first.', true);
  if (all.length > 20) return say('Choose 20 photos or fewer for one document.', true);
  o.files = all;
  o.prepared = null;
  o.job.dirty = true;
  say('');
  docFiles(o);
}
function docFiles(o) {
  const f = o.files;
  const n = f.length;
  $('#dc-files', o.el).innerHTML = !n ? '' : `<div class="dc-pick">${icon(f[0].type === 'application/pdf' ? 'doc' : 'image')}<span><b>${n === 1 ? esc(f[0].name) : `${n} photos`}</b><small>${n === 1 ? fileSize(f[0].size) : `Saved as one PDF, ${n} pages · ${fileSize(f.reduce((s, x) => s + x.size, 0))} before shrinking`}</small></span><button type="button" class="btn sm ghost" data-dc-clear="1">Clear</button></div>`;
}
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function submitDoc(o) {
  const msg = $('#dc-msg', o.el), btn = $('#dc-save', o.el);
  const say = (t, bad) => { msg.textContent = t; msg.className = 'msg' + (bad ? ' err' : ''); };
  if (o.job.saving) return;
  const d = findDog(o.docDog.chip, o.docDog.id);
  if (!d) return say('This dog is no longer in All Breeds.', true);
  const type = $('#dc-type', o.el).value, k = kindOfDoc(type);
  if (!o.files.length) { say('Choose a PDF or photos to add.', true); $('#dc-file', o.el).focus(); return; }
  o.job.saving = true; btn.disabled = true; btn.textContent = 'Saving…';
  let again = false;
  try {
    if (!o.prepared) {
      // the file is prepared once, so pressing Save again sends exactly the same thing
      say(o.files.length > 1 ? 'Putting the photos together…' : 'Preparing the file…');
      const f = o.files;
      let mime, data;
      if (f[0].type === 'application/pdf') {
        const buf = await f[0].arrayBuffer();
        const head = new Uint8Array(buf.slice(0, 4));
        if (String.fromCharCode(...head) !== '%PDF') throw userErr(`“${f[0].name}” isn’t a readable PDF.`);
        mime = 'application/pdf'; data = bufToB64(buf);
      } else if (f.length === 1) {
        mime = 'image/jpeg'; data = (await resizeImage(f[0], 2400, 0.88)).split(',')[1];
      } else {
        const pages = [];
        for (const x of f) pages.push(await resizeImage(x, 2000, 0.85));
        const res = await window.k9.imagesPdf(pages);
        if (!res || !res.ok) throw userErr('Couldn’t put the photos together into a PDF.');
        mime = 'application/pdf'; data = res.data;
      }
      if (data.length > DOC_MAX_CHARS) throw userErr(f.length > 1 ? 'Together the photos are over 10 MB. Use fewer photos, or add them as two documents.' : 'The file is over 10 MB. Save a smaller copy and try again.');
      o.prepared = { mime, data };
    }
    const link = $('#dc-link-f', o.el).hidden ? '' : $('#dc-link', o.el).value;
    const payload = {
      action: 'doc_upload', aid: d.id || '', chip: d.chip || '', dog: dogLabel(d), type,
      date: $('#dc-date', o.el).value || '', country: k.country ? $('#dc-country', o.el).value.trim() : '', note: $('#dc-note', o.el).value.trim(),
      mime: o.prepared.mime, data: o.prepared.data,
      link: link && o.linkSeen.has(link) ? { tab: link.split('|')[0], row: +link.split('|')[1], expect: o.linkSeen.get(link) } : null,
    };
    say(`Uploading ${fileSize(Math.round(o.prepared.data.length * 0.75))}… This can take a minute.`);
    if (!o.opId) o.opId = newOpId();
    let res;
    try { res = await sendWrite(payload, o.opId); o.opId = null; }
    catch (e) {
      if (e.code === 'changed_after_save') {
        // the first press did save it: don't offer to save a second copy
        o.job.saving = false; closeTop(true);
        toast('This document was saved a moment ago, but without your latest changes. Check it under Documents; to change it, remove it and add it again.', true);
        scheduleRefresh(300);
        return;
      }
      if (!(e.keepOp || e.code === 'locked')) o.opId = null; // same ID on the next press, so it can't be filed twice
      again = !!o.opId;
      if (e.refresh) scheduleRefresh(800);
      throw e;
    }
    o.job.saving = false;
    if (!S.docs.some(x => x.id === res.doc.id)) S.docs.push(res.doc);
    closeTop(true);
    const L = res.doc.tab && LOG[res.doc.tab];
    toast(res.linkSkipped === 'changed' ? `Document saved. It wasn’t linked: that record changed in the sheet while you were adding it.`
      : res.linkWritten && L ? `Document saved and linked to the ${L.noun} in the sheet`
      : `${type} saved for ${dogName(d)}`, res.linkSkipped === 'changed');
    rebuild(); renderAll();
    focusDocs();
    scheduleRefresh(1500);
  } catch (e) {
    o.job.saving = false;
    btn.textContent = again ? 'Save again' : 'Save document';
    say(e.userMessage || e.message || 'Couldn’t save the document.', true);
  } finally { btn.disabled = false; }
}
/** After the profile is redrawn, put keyboard focus back in the Documents section. */
function focusDocs() { setTimeout(() => { const b = $('.drawer [data-action="doc-add"]:not([data-type])') || $('.drawer #dr-docs'); if (b) { if (!b.matches('button')) b.tabIndex = -1; b.focus(); } }, 180); }

/* opening and removing */
async function openDocFile(id, btn) {
  const x = (S.docs || []).find(y => y.id === id);
  if (!x) return;
  if (btn) btn.disabled = true;
  toast(`Opening ${x.type.toLowerCase()}…`);
  const res = await window.k9.docOpen({ id, name: x.name, mime: x.mime }).catch(() => null);
  if (btn) btn.disabled = false;
  if (!res || !res.ok) toast(res && res.error === 'network' ? 'Couldn’t reach Google. Check the internet connection, then try again.' : 'Couldn’t open it here. Try the Google Drive button next to it.', true);
}
function askDocRemove(id) {
  const x = (S.docs || []).find(y => y.id === id);
  if (!x) return;
  modal('doc-rm', {
    title: 'Remove this document?', narrow: true,
    body: `<p><b>${esc(x.type)}</b>${x.dog ? ` for ${esc(x.dog)}` : ''}${docWhen(x) ? `, dated ${esc(docWhen(x))}` : ''}.</p><p class="muted">The file moves to the bin in your Google Drive, where it can be restored for 30 days.</p>`,
    foot: `<span class="msg" id="rm-msg" aria-live="polite"></span><button class="btn" data-action="close-top">Keep it</button><button class="btn danger" data-action="doc-remove-yes" data-doc="${esc(id)}">Remove</button>`,
  });
}
async function removeDoc(id, btn) {
  const msg = $('#rm-msg');
  btn.disabled = true;
  try {
    await sendWrite({ action: 'doc_remove', id }, newOpId());
    S.docs = (S.docs || []).filter(x => x.id !== id);
    window.k9.docForget(id).catch(() => {});
    closeTop(true);
    toast('Document removed');
    rebuild(); renderAll();
    focusDocs();
  } catch (e) {
    btn.disabled = false;
    if (msg) { msg.textContent = e.userMessage || 'Couldn’t remove it.'; msg.className = 'msg err'; }
  }
}
