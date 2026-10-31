/* ───────── record a litter ───────── */
const LITTER_TAB = 'Puppies Bred In-House';
function sourceForBredHere() {
  const t = S.db[MASTER];
  const c = t && t.idx.get('Source');
  if (c != null) { const v = t.rows.map(r => r.v[c]).find(x => /house|bred here|own/i.test(x || '')); if (v) return v; }
  return 'Bred in-house';
}
function openLitter(damChip) {
  if (!S.db) return;
  if (needBridge('Recording a litter')) return;
  if (!S.db[LITTER_TAB]) { toast(`The sheet has no “${LITTER_TAB}” tab.`, true); return; }
  const colours = Array.from(new Set(DOGS.map(d => d.colour).filter(Boolean))).sort();
  const breedRule = ruleOf(S.db[MASTER], S.db[MASTER].idx.get('Breed'));
  const breeds = Array.from(new Set([...((breedRule && breedRule.list) || []), ...DOGS.map(d => d.breed)].filter(Boolean))).sort();
  const kns = kennelList();
  const o = modal('litter', {
    title: 'Record a litter', wide: true, form: true,
    sub: `Saves the litter to “${LITTER_TAB}” and adds each puppy to All Breeds with its parents linked.`,
    body: `<p class="form-warn" id="lt-warn" hidden></p>
    <div class="lit-grid">
      <section aria-labelledby="lt-h1"><h3 id="lt-h1">Parents</h3><div class="form-grid">
        <div class="field"><label for="lt-dam">Dam (mother) <span class="req" aria-hidden="true">*</span></label><input class="inp chip" id="lt-dam" list="lt-dams" inputmode="numeric" placeholder="Type or scan her microchip" value="${esc(damChip || '')}" autocomplete="off"><span class="hint" id="lt-dam-h" aria-live="polite">Choose a dog</span></div>
        <div class="field"><label for="lt-sire">Sire (father)</label><input class="inp chip" id="lt-sire" list="lt-sires" inputmode="numeric" placeholder="Type or scan his microchip" autocomplete="off"><span class="hint" id="lt-sire-h" aria-live="polite">Optional</span></div>
      </div></section>
      <section aria-labelledby="lt-h2"><h3 id="lt-h2">Birth</h3><div class="form-grid">
        <div class="field"><label for="lt-dob">Date born <span class="req" aria-hidden="true">*</span></label><input class="inp" type="date" id="lt-dob" value="${isoD(TODAY)}"></div>
        <div class="field"><label for="lt-del">Delivery</label><select class="sel" id="lt-del"><option>Natural</option><option>C-section</option></select></div>
        <div class="field"><label for="lt-no">Litter number for this dam</label><input class="inp" type="number" min="1" id="lt-no"></div>
        <div class="field"><label for="lt-n">Number of puppies <span class="req" aria-hidden="true">*</span></label><input class="inp" type="number" min="1" max="20" id="lt-n" value="1"></div>
        <div class="field wide"><label for="lt-notes">Notes</label><textarea class="inp" id="lt-notes"></textarea></div>
      </div></section>
    </div>
    <section aria-labelledby="lt-h3"><h3 id="lt-h3">Puppies</h3>
      <div class="form-grid three">
        <div class="field"><label for="lt-breed">Breed for all puppies <span class="req" aria-hidden="true">*</span></label><input class="inp" id="lt-breed" list="lt-breeds" autocomplete="off"><datalist id="lt-breeds">${breeds.map(b => `<option value="${esc(b)}"></option>`).join('')}</datalist></div>
        <div class="field"><label for="lt-prem">Premise</label><input class="inp" id="lt-prem" list="lt-prems" autocomplete="off"><datalist id="lt-prems">${Array.from(new Set(DOGS.map(d => d.premise).filter(Boolean))).map(p => `<option value="${esc(p)}"></option>`).join('')}</datalist></div>
        <div class="field"><label for="lt-ken">Kennel</label><select class="sel" id="lt-ken"><option value="">No kennel yet</option>${kns.map(k => `<option value="${esc(k.no)}">Kennel ${esc(k.no)}</option>`).join('')}</select></div>
      </div>
      <div class="pup-table" id="lt-pups"></div>
      <p class="hint">Names and microchips are optional now. Add them later with <b>Edit details</b> on each puppy.</p>
    </section>
    <div class="checks-row">
      <label class="check-inline"><input type="checkbox" id="lt-add" checked> Add each puppy to All Breeds</label>
      <label class="check-inline" id="lt-mat-wrap" hidden><input type="checkbox" id="lt-mat" checked> <span id="lt-mat-t">Mark her mating as successful</span></label>
    </div>
    <datalist id="lt-dams">${DOGS.filter(d => d.chip && isFemale(d)).map(d => `<option value="${esc(d.chip)}">${esc(dogLabel(d) + ' · ' + titleCase(d.breed))}</option>`).join('')}</datalist>
    <datalist id="lt-sires">${DOGS.filter(d => d.chip && isMale(d)).map(d => `<option value="${esc(d.chip)}">${esc(dogLabel(d) + ' · ' + titleCase(d.breed))}</option>`).join('')}</datalist>
    <datalist id="lt-cols">${colours.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>`,
    foot: `<span class="msg" id="lt-msg" aria-live="polite"></span><button type="button" class="btn" data-action="close-top">Cancel</button><button type="submit" class="btn primary" id="lt-save">Save litter</button>`,
    guard: () => formGuard(o),
  });
  o.job = { tab: LITTER_TAB, prefix: 'lt', dirty: false };
  const pups = [];
  const drawPups = () => {
    const n = Math.max(1, Math.min(20, +$('#lt-n', o.el).value || 1));
    while (pups.length < n) pups.push({ sex: '', colour: '', name: '', chip: '' });
    pups.length = n;
    $('#lt-pups', o.el).innerHTML = `<table><thead><tr><th scope="col">#</th><th scope="col">Sex *</th><th scope="col">Colour</th><th scope="col">Name</th><th scope="col">Microchip</th></tr></thead><tbody>${pups.map((p, i) => `<tr>
      <td class="num">${i + 1}</td>
      <td><label class="sr" for="pp-sex-${i}">Puppy ${i + 1} sex</label><select class="sel" id="pp-sex-${i}" data-p="${i}" data-f="sex"><option value="">Choose…</option><option value="M" ${p.sex === 'M' ? 'selected' : ''}>Male</option><option value="F" ${p.sex === 'F' ? 'selected' : ''}>Female</option></select></td>
      <td><label class="sr" for="pp-col-${i}">Puppy ${i + 1} colour</label><input class="inp" id="pp-col-${i}" data-p="${i}" data-f="colour" list="lt-cols" value="${esc(p.colour)}" autocomplete="off"></td>
      <td><label class="sr" for="pp-name-${i}">Puppy ${i + 1} name</label><input class="inp" id="pp-name-${i}" data-p="${i}" data-f="name" value="${esc(p.name)}" autocomplete="off"></td>
      <td><label class="sr" for="pp-chip-${i}">Puppy ${i + 1} microchip</label><input class="inp chip" id="pp-chip-${i}" data-p="${i}" data-f="chip" inputmode="numeric" value="${esc(p.chip)}" autocomplete="off" placeholder="Optional"></td></tr>`).join('')}</tbody></table>`;
  };
  const parents = () => {
    const dam = findDog($('#lt-dam', o.el).value), sire = findDog($('#lt-sire', o.el).value);
    $('#lt-dam-h', o.el).textContent = dam ? `${dogLabel(dam)} · ${titleCase(dam.breed)}` : $('#lt-dam', o.el).value ? 'No dog with this microchip' : 'Choose a dog';
    $('#lt-sire-h', o.el).textContent = sire ? `${dogLabel(sire)} · ${titleCase(sire.breed)}` : $('#lt-sire', o.el).value ? 'No dog with this microchip' : 'Optional';
    const w = $('#lt-warn', o.el);
    if (dam) {
      const b = breedInfo(dam);
      const flags = breedingFlags(dam, b).filter(f => f.sev === 'crit' && f.key !== 'young');
      w.hidden = !flags.length;
      w.innerHTML = flags.length ? `${icon('info')}<span><b>${esc(dogName(dam))} has reached a breeding limit:</b> ${esc(flags.map(f => f.text).join('; '))}. You can still record the litter.</span>` : '';
      if (!$('#lt-no', o.el).dataset.touched) $('#lt-no', o.el).value = b.litters + 1;
      const m = b.lastMating, succ = m ? cell(m.t, m.row, 'Successful').trim() : 'x';
      const dob = parseDate($('#lt-dob', o.el).value);
      const gap = m && m.date && dob ? Math.round((dob - m.date) / 864e5) : -1;
      const show = !!m && !succ && gap >= 45 && gap <= 80;
      $('#lt-mat-wrap', o.el).hidden = !show;
      if (show) $('#lt-mat-t', o.el).textContent = `Mark her mating on ${dmy(m.date)} as successful`;
      o.mating = show ? m : null;
      if (!$('#lt-prem', o.el).dataset.touched) $('#lt-prem', o.el).value = dam.premise || '';
      if (!$('#lt-ken', o.el).dataset.touched) $('#lt-ken', o.el).value = dam.kennel || '';
      if (!$('#lt-breed', o.el).dataset.touched) $('#lt-breed', o.el).value = !sire || sire.breed === dam.breed ? dam.breed : '';
      if (!$('#lt-sire', o.el).value && b.expecting && b.expecting.sireChip) { $('#lt-sire', o.el).value = b.expecting.sireChip; parents(); }
    } else { w.hidden = true; o.mating = null; $('#lt-mat-wrap', o.el).hidden = true; }
  };
  const form = $('form', o.el);
  form.addEventListener('input', e => {
    o.job.dirty = true;
    const p = e.target.dataset.p;
    if (p != null) { pups[+p][e.target.dataset.f] = e.target.value; return; }
    if (['lt-no', 'lt-prem', 'lt-ken', 'lt-breed'].includes(e.target.id)) e.target.dataset.touched = '1';
    if (e.target.id === 'lt-n') drawPups();
    if (['lt-dam', 'lt-sire', 'lt-dob'].includes(e.target.id)) parents();
  });
  form.addEventListener('change', e => { const p = e.target.dataset.p; if (p != null) pups[+p][e.target.dataset.f] = e.target.value; if (e.target.id === 'lt-ken') e.target.dataset.touched = '1'; });
  form.addEventListener('submit', e => { e.preventDefault(); submitLitter(o, pups); });
  drawPups(); parents();
}
async function submitLitter(o, pups) {
  const msg = $('#lt-msg', o.el), btn = $('#lt-save', o.el);
  const say = (t, bad, focus) => { msg.textContent = t; msg.className = 'msg' + (bad ? ' err' : ''); if (focus) { const f = $('#' + focus, o.el); if (f) f.focus(); } };
  const v = id => String(($('#' + id, o.el) || {}).value || '').trim();
  const dam = findDog(v('lt-dam')), sire = findDog(v('lt-sire'));
  if (!dam) return say('Choose the dam from the list or scan her microchip.', true, 'lt-dam');
  if (v('lt-sire') && !sire) return say('The sire’s microchip isn’t in All Breeds. Clear it or pick him from the list.', true, 'lt-sire');
  if (!parseDate(v('lt-dob'))) return say('Please enter the date the puppies were born.', true, 'lt-dob');
  const addPups = $('#lt-add', o.el).checked;
  const breed = v('lt-breed');
  if (addPups && !breed) return say('Please enter the breed for the puppies.', true, 'lt-breed');
  const br = ruleOf(S.db[MASTER], S.db[MASTER].idx.get('Breed'));
  if (addPups && br && br.list && br.strict !== false && !br.list.includes(breed)) return say(`“${breed}” isn’t in the Breed dropdown in your sheet, so Google would refuse it. Pick a breed from the list, or add it to the dropdown in the sheet first.`, true, 'lt-breed');
  const missingSex = pups.findIndex(p => !p.sex);
  if (missingSex >= 0) return say(`Choose the sex for puppy ${missingSex + 1}.`, true, `pp-sex-${missingSex}`);
  const chips = pups.map(p => normChip(p.chip)).filter(Boolean);
  const bad = chips.find(c => c.length !== 15);
  if (bad) return say(`Microchip ${bad} has ${bad.length} digits. ISO microchips have 15.`, true);
  if (new Set(chips).size !== chips.length) return say('Two puppies have the same microchip.', true);
  const taken = chips.find(c => BYCHIP.has(c));
  if (taken) return say(`Microchip ${taken} already belongs to ${dogLabel(BYCHIP.get(taken))}.`, true);
  const m = pups.filter(p => p.sex === 'M').length, f = pups.filter(p => p.sex === 'F').length;
  const colours = Array.from(new Set(pups.map(p => p.colour.trim()).filter(Boolean)));
  const dob = v('lt-dob');
  const ch = (h, val, kind) => ({ h, k: 0, v: String(val == null ? '' : val), kind });
  const keep = list => list.filter(x => x.v !== '');
  const ops = [{ tab: LITTER_TAB, mode: 'new', dog: dogLabel(dam), changes: keep([
    ch('Dam Microchip', dam.chip, 'chip'), ch('Dam Breed', dam.breed, 'text'), ch('Dam DOB', dam.dob ? isoD(dam.dob) : '', 'date'), ch('Dam Source', dam.source, 'text'),
    ch('Sire Microchip', sire ? sire.chip : '', 'chip'), ch('Sire Breed', sire ? sire.breed : '', 'text'), ch('Litter DOB', dob, 'date'), ch('Delivery Method', v('lt-del'), 'text'),
    ch('Litter No.', v('lt-no'), 'number'), ch('No. of Puppies', pups.length, 'number'), ch('Puppy Microchips', chips.join(', '), 'long'),
    ch('Sex Breakdown', [m ? `${m} M` : '', f ? `${f} F` : ''].filter(Boolean).join(', '), 'long'), ch('Colours', colours.join(', '), 'text'), ch('Notes', v('lt-notes'), 'long')]) }];
  if (addPups) pups.forEach(p => ops.push({ tab: MASTER, mode: 'new', dog: p.name || `${titleCase(breed)} puppy`, changes: keep([
    ch('Microchip No.', normChip(p.chip), 'chip'), ch('Name', p.name.trim(), 'text'), ch('Breed', breed, 'text'), ch('Colour', p.colour.trim(), 'text'), ch('Sex', p.sex, 'sex'),
    ch('Date of Birth', dob, 'date'), ch('Premise', v('lt-prem'), 'text'), ch('Kennel No.', v('lt-ken'), 'text'), ch('Status', 'Active', 'status'), ch('Source', sourceForBredHere(), 'text'),
    ch('Dam Microchip', dam.chip, 'chip'), ch('Sire Microchip', sire ? sire.chip : '', 'chip')]) }));
  if (o.mating && $('#lt-mat', o.el).checked) { const mt = o.mating.t; const sc = mt.idx.get('Successful'); ops.push({ tab: 'Mating Records', mode: 'edit', row: o.mating.row.r, dog: dogLabel(dam), changes: [{ h: 'Successful', k: occOf(mt.headers, sc), v: 'Yes', kind: 'text' }], expect: rowExpect(mt, o.mating.row) }); }
  o.job.saving = true; btn.disabled = true; btn.textContent = 'Saving…';
  say('Saving the litter…');
  if (!o.opId) o.opId = newOpId();
  let res;
  try { res = await sendWrite({ action: 'batch', ops }, o.opId); o.opId = null; }
  catch (e) {
    o.job.saving = false; btn.disabled = false; btn.textContent = keepOpAfter(e) ? 'Save again' : 'Save litter';
    if (savedBefore(e)) return;
    if (!keepOpAfter(e)) o.opId = null;
    if (e.refresh) scheduleRefresh(800);
    return say(e.code === 'row_changed' ? 'Her mating record changed in the sheet while you were working. Untick “Mark her mating as successful” or reopen this window, then save again.' : e.userMessage || String(e.message || e), true);
  }
  o.job.saving = false; btn.disabled = false; btn.textContent = 'Save litter';
  closeTop(true);
  skippedNote([].concat(...(res.results || []).map(r => (r && r.skipped) || [])));
  const ids = (res.results || []).map(r => r && r.id).filter(Boolean);
  toast(ids.length ? `Litter saved. ${ids.length === 1 ? ids[0] : `${ids[0]} to ${ids[ids.length - 1]}`} added to All Breeds.` : 'Litter saved.');
  applyLocalBatch(ops, res.results);
  scheduleRefresh(1500);
}
