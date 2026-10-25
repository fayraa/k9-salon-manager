/* ───────── connection states ───────── */
function connectState() {
  const c = S.conn;
  if (c.state === 'setup') return setupView();
  if (c.state === 'error') {
    return `<div class="empty"><span class="pill crit">Not connected</span><h2>Your kennel records couldn’t load</h2><p>${esc(c.msg)}</p>
      <div class="row"><button class="btn primary" data-action="reload">${icon('sync')}Try again</button><button class="btn" data-action="open-connection">Connection settings</button></div></div>`;
  }
  return `<div class="empty"><span class="pill acc">Connecting</span><h2>Loading your kennel records</h2>
  <p>This takes a few seconds while Google gathers every tab of your sheet.</p>
  <div class="skels"><div class="skel" style="width:70%"></div><div class="skel" style="width:92%"></div><div class="skel" style="width:56%"></div></div></div>`;
}

/* ───────── home ───────── */
function greeting() {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const who = (S.prefs.who || '').split(' ')[0];
  return who ? `${part}, ${who}` : part;
}
function dueRow(u) {
  const attr = u.chip || u.id ? `data-action="open-dog" data-chip="${esc(u.chip || '')}" data-id="${esc(u.id || '')}"` : u.tab ? `data-action="nav" data-view="log" data-tab="${esc(u.tab)}"` : '';
  const pill = u.days < 0 ? `<span class="pill crit">${plural(-u.days, 'day')} late</span>` : u.days === 0 ? '<span class="pill warn">Today</span>' : `<span class="pill">In ${plural(u.days, 'day')}</span>`;
  return `<button class="li" ${attr}><span class="d">${shortD(u.date)}</span><span class="t"><b>${esc(u.kind)}</b> · ${esc(u.title)}<small>${esc(u.sub || '')}</small></span>${pill}</button>`;
}
function issueSummary() {
  const issues = {};
  for (const d of DOGS) for (const i of d.issues) { const o = issues[i.k] || (issues[i.k] = { crit: 0, warn: 0, dogs: 0 }); o[i.sev]++; }
  for (const k in issues) issues[k].dogs = DOGS.filter(d => d.issues.some(i => i.k === k)).length;
  return issues;
}
function viewHome() {
  const active = DOGS.filter(isActive);
  const breeding = active.filter(onBreedingPremise);
  const pups = active.filter(d => { const m = ageMonths(d.dob); return m != null && m < 12; });
  const retired = DOGS.filter(isRetired);
  const issues = issueSummary();
  const keys = Object.keys(ISSUE).filter(k => issues[k]);
  const attn = keys.length ? keys.map(k => { const o = issues[k]; const sev = o.crit ? 'crit' : 'warn'; return `<button data-action="filter-issue" data-issue="${k}"><span class="bar ${sev}" aria-hidden="true"></span><span class="t"><b>${esc(ISSUE[k].label)}</b><small>${o.crit ? `${o.crit} need action` : ''}${o.crit && o.warn ? ' · ' : ''}${o.warn ? `${o.warn} coming up` : ''}</small></span><span class="n" aria-label="${o.dogs} dogs">${o.dogs}</span>${icon('chev', 'muted')}</button>`; }).join('')
    : `<div class="panel-b muted">Nothing needs attention right now.</div>`;
  const up = upcoming(S.shared.dueSoonDays || 14);
  const upHTML = up.length ? up.slice(0, 8).map(dueRow).join('') + (up.length > 8 ? `<button class="li more" data-action="report-tab" data-tab="due"><span></span><span class="t">See all ${up.length}</span>${icon('chev', 'muted')}</button>` : '')
    : `<div class="panel-b muted">Nothing due in the next ${S.shared.dueSoonDays || 14} days. Due dates come from vaccinations, parasite treatments, heats, matings and training.</div>`;
  const qa = (action, ico, label, sub, extra = '') => `<button class="qa-btn" data-action="${action}" ${extra}>${icon(ico)}<span><b>${esc(label)}</b><small>${esc(sub)}</small></span></button>`;
  const can2 = S.bridgeVersion >= NEED_BRIDGE;
  return `
  <div class="hello"><h2>${esc(greeting())}</h2><p class="muted">${MONTH[TODAY.getUTCMonth()] ? `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][TODAY.getUTCDay()]} ${TODAY.getUTCDate()} ${MONTH[TODAY.getUTCMonth()]}` : ''}</p></div>
  <div class="quick">
    ${qa('bulk', 'many', 'Log for many dogs', can2 ? 'Vaccinate or deworm a group in one go' : 'Needs the bridge update')}
    ${qa('litter', 'litter', 'Record a litter', can2 ? 'Adds the litter and each puppy' : 'Needs the bridge update')}
    ${qa('add-dog', 'plus', 'Add a dog', 'New arrival or purchase')}
    ${qa('report-tab', 'report', 'Monthly AVS report', 'Summary for your submission', 'data-tab="monthly"')}
  </div>
  <div class="kpis">
    <button class="kpi" data-action="dogs-status" data-status="active"><span class="eyebrow">Active dogs</span><b>${active.length}</b><small>of ${DOGS.length} on record</small></button>
    <button class="kpi" data-action="dogs-status" data-status="breeding"><span class="eyebrow">Breeding dogs</span><b>${breeding.length}</b><small>active on the breeding premise</small></button>
    <button class="kpi" data-action="dogs-status" data-status="puppies"><span class="eyebrow">Puppies</span><b>${pups.length}</b><small>under 12 months</small></button>
    <button class="kpi" data-action="dogs-status" data-status="retired"><span class="eyebrow">Retired</span><b>${retired.length}</b><small>kept on site</small></button>
  </div>
  <div class="grid g2">
    <section class="panel" aria-labelledby="h-attn"><div class="panel-h"><h2 id="h-attn">Needs attention</h2><span class="aside">Dogs</span></div><div class="attn">${attn}</div></section>
    <section class="panel" aria-labelledby="h-due"><div class="panel-h"><h2 id="h-due">Coming up</h2><span class="aside">Next ${S.shared.dueSoonDays || 14} days</span></div><div class="list">${upHTML}</div></section>
  </div>`;
}

/* ───────── dogs ───────── */
function dogList() {
  const f = S.dogs;
  const q = f.q.trim().toLowerCase(), qd = normChip(f.q);
  const list = DOGS.filter(d => {
    const m = ageMonths(d.dob);
    if (f.status === 'active' && !isActive(d)) return false;
    if (f.status === 'puppies' && !(isActive(d) && m != null && m < 12)) return false;
    if (f.status === 'breeding' && !(isActive(d) && onBreedingPremise(d))) return false;
    if (f.status === 'retired' && !isRetired(d)) return false;
    if (f.status === 'adopted' && !isAdopted(d)) return false;
    if (f.breed && d.breed !== f.breed) return false;
    if (f.sex && !String(d.sex).toUpperCase().startsWith(f.sex)) return false;
    if (f.issue && !d.issues.some(i => i.k === f.issue)) return false;
    if (q) {
      const hay = `${d.id} ${d.name} ${d.breed} ${d.colour} ${d.kennel} ${d.remarks}`.toLowerCase();
      if (!hay.includes(q) && !(qd.length >= 3 && d.chip.includes(qd))) return false;
    }
    return true;
  });
  const key = { id: d => d.id, name: d => (d.name || '~').toLowerCase(), breed: d => d.breed, age: d => -(d.dob ? d.dob.getTime() : -1e15), status: d => d.status, kennel: d => (d.kennel ? d.kennel.padStart(4, '0') : '~') }[f.sort] || (d => d.id);
  list.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * f.dir; });
  return list;
}
function viewDogs() {
  const f = S.dogs;
  const breeds = Array.from(new Set(DOGS.map(d => d.breed).filter(Boolean))).sort();
  const segs = [['active', 'Active'], ['breeding', 'Breeding'], ['puppies', 'Puppies'], ['retired', 'Retired'], ['adopted', 'Adopted'], ['all', 'All']];
  const mode = `<div class="seg" role="group" aria-label="Show as">${[['list', 'List', 'list'], ['kennels', 'Kennels', 'grid']].map(([k, l, i]) => `<button data-action="dogs-mode" data-mode="${k}" aria-pressed="${S.dogsMode === k}">${icon(i)}${l}</button>`).join('')}</div>`;
  if (S.dogsMode === 'kennels') return `<div class="toolbar">${mode}</div>${kennelsHTML()}`;
  return `
  <div class="toolbar">
    ${mode}
    <label class="search"><span class="sr">Search dogs</span>${icon('search')}<input class="inp" id="dog-q" placeholder="Name, ID or microchip" value="${esc(f.q)}" autocomplete="off"></label>
    <div class="seg" role="group" aria-label="Which dogs">${segs.map(([k, l]) => `<button data-action="dogs-status" data-status="${k}" aria-pressed="${f.status === k}">${l}</button>`).join('')}</div>
    <label class="sr" for="dog-breed">Breed</label><select class="sel" id="dog-breed"><option value="">All breeds</option>${breeds.map(b => `<option ${b === f.breed ? 'selected' : ''} value="${esc(b)}">${esc(titleCase(b))}</option>`).join('')}</select>
    <label class="sr" for="dog-sex">Sex</label><select class="sel" id="dog-sex"><option value="">Both sexes</option><option value="F" ${f.sex === 'F' ? 'selected' : ''}>Female</option><option value="M" ${f.sex === 'M' ? 'selected' : ''}>Male</option></select>
    ${isPhone() ? `<label class="sr" for="dog-sort">Sort by</label><select class="sel" id="dog-sort">${DOG_SORTS.map(([k, l]) => `<option value="${k}" ${f.sort === k ? 'selected' : ''}>Sort: ${l}</option>`).join('')}</select>` : ''}
    ${f.issue ? `<button class="filter-chip" data-action="clear-issue" aria-label="Remove filter: ${esc(ISSUE[f.issue].label)}">${esc(ISSUE[f.issue].label)}${icon('x')}</button>` : ''}
    ${f.issue && QF_PRESETS.some(p => p.issue === f.issue) ? `<button class="btn sm" data-action="quick-fill" data-issue="${esc(f.issue)}">${icon('sheet')}Fill these in</button>` : ''}
    <span class="count" id="dog-count" aria-live="polite"></span>
  </div>
  <div id="dog-table"></div>`;
}
const DOG_SORTS = [['id', 'ID'], ['name', 'Name'], ['breed', 'Breed'], ['age', 'Age'], ['kennel', 'Kennel'], ['status', 'Status']];
const issuePills = d => d.issues.map(i => `<span class="pill ${i.sev}" title="${esc(i.text)}">${esc(ISSUE[i.k].short)}</span>`).join('') || '<span class="pill ok">All good</span>';
function dogTableHTML() {
  const list = dogList();
  const f = S.dogs;
  if (isPhone()) {
    // a card per dog on a phone, with the same details as the table's columns
    const cards = list.map(d => `<li><button class="dogcard" data-action="open-dog" data-chip="${esc(d.chip)}" data-id="${esc(d.id)}">
      <span class="dc-h"><b class="nm">${nameHTML(d)}</b><span class="muted num">${esc(d.id)}</span><span class="spacer"></span>${statusPill(d.status)}</span>
      <small>${esc([titleCase(d.breed), sexWord(d.sex), ageText(d.dob), d.kennel ? `Kennel ${d.kennel}` : ''].filter(Boolean).join(' · '))}</small>
      <span class="dc-f">${chipHTML(d.chip)}<span class="pills">${issuePills(d)}</span></span></button></li>`).join('');
    return { count: list.length, html: list.length ? `<ul class="dogcards" aria-label="Dogs">${cards}</ul>` : `<div class="empty"><h2>No dogs match these filters</h2><p>Try another group or clear the search.</p></div>` };
  }
  const th = (k, l) => `<th aria-sort="${f.sort === k ? (f.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button data-action="sort" data-sort="${k}">${l}${f.sort === k ? (f.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  const rows = list.map(d => `<tr class="click" data-action="open-dog" data-chip="${esc(d.chip)}" data-id="${esc(d.id)}" tabindex="0" aria-label="${esc(dogLabel(d))}">
    <td class="num muted">${esc(d.id)}</td><td><b class="nm">${nameHTML(d)}</b><span class="sub">${esc(titleCase(d.colour))}</span></td>
    <td>${esc(titleCase(d.breed))}</td><td>${esc(sexWord(d.sex))}</td><td class="num">${esc(ageText(d.dob))}</td><td class="num">${esc(d.kennel || '—')}</td><td>${chipHTML(d.chip)}</td>
    <td>${statusPill(d.status)}</td><td><div class="pills">${issuePills(d)}</div></td></tr>`).join('');
  return { count: list.length, html: list.length ? `<div class="table-wrap"><table><thead><tr>${th('id', 'ID')}${th('name', 'Name')}${th('breed', 'Breed')}<th>Sex</th>${th('age', 'Age')}${th('kennel', 'Kennel')}<th>Microchip</th>${th('status', 'Status')}<th>To do</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : `<div class="empty"><h2>No dogs match these filters</h2><p>Try another group or clear the search.</p></div>` };
}
function refreshDogTable() {
  const box = $('#dog-table'); if (!box) return;
  const r = dogTableHTML();
  box.innerHTML = r.html;
  const c = $('#dog-count'); if (c) c.textContent = plural(r.count, 'dog');
}

/* ───────── kennels ───────── */
function kennelList() {
  const t = S.db['Kennels'];
  const out = [];
  if (t) for (const r of t.rows) {
    const no = String(cell(t, r, 'Kennel No.')).trim();
    if (!no) continue;
    const capRaw = cell(t, r, 'Capacity');
    out.push({ no, block: cell(t, r, 'Block'), capacity: capRaw !== '' && isFinite(+capRaw) ? +capRaw : null, type: cell(t, r, 'Type'), notes: cell(t, r, 'Notes'), row: r });
  }
  const known = new Set(out.map(k => k.no));
  const extra = Array.from(new Set(DOGS.filter(isActive).map(d => d.kennel).filter(k => k && !known.has(k))));
  extra.forEach(no => out.push({ no, block: '', capacity: null, type: '', notes: '', missing: true }));
  return out.sort((a, b) => (a.block || '~').localeCompare(b.block || '~') || (parseFloat(a.no) - parseFloat(b.no)) || a.no.localeCompare(b.no));
}
function kennelsHTML() {
  const ks = kennelList();
  const active = DOGS.filter(isActive);
  const by = {};
  active.forEach(d => { if (d.kennel) (by[d.kennel] = by[d.kennel] || []).push(d); });
  const none = active.filter(d => !d.kennel);
  const blocks = {};
  ks.forEach(k => (blocks[k.block || 'No block'] = blocks[k.block || 'No block'] || []).push(k));
  const card = k => {
    const dogs = (by[k.no] || []).sort((a, b) => dogName(a).localeCompare(dogName(b)));
    const n = dogs.length;
    const over = k.capacity != null && n > k.capacity;
    const pct = k.capacity ? Math.min(100, n / k.capacity * 100) : 0;
    return `<section class="kennel${over ? ' over' : ''}" aria-label="Kennel ${esc(k.no)}">
      <div class="kn-h"><h3>Kennel ${esc(k.no)}</h3>${k.type ? `<span class="pill">${esc(k.type)}</span>` : ''}${over ? '<span class="pill crit">Over capacity</span>' : ''}</div>
      <div class="kn-cap"><span>${k.capacity != null ? `${n} of ${k.capacity}` : plural(n, 'dog')}</span>${k.capacity ? `<span class="bar-track" aria-hidden="true"><span class="bar-fill" style="display:block;width:${pct.toFixed(0)}%"></span></span>` : ''}</div>
      ${k.missing ? '<p class="muted small">Used on dogs but not in the Kennels tab.</p>' : ''}${k.notes ? `<p class="muted small">${esc(k.notes)}</p>` : ''}
      <div class="kn-dogs">${dogs.map(d => `<button class="dogchip" data-action="open-dog" data-chip="${esc(d.chip)}" data-id="${esc(d.id)}">${esc(dogName(d))}<small>${esc(sexWord(d.sex).charAt(0))}</small></button>`).join('') || '<span class="muted small">Empty</span>'}</div>
      <button class="btn sm ghost" data-action="move-dog" data-kennel="${esc(k.no)}">${icon('move')}Move a dog here</button>
    </section>`;
  };
  if (!ks.length) return `<div class="empty"><h2>No kennels yet</h2><p>Add kennels in the Kennels tab (Records → Farm → Kennels) and give each dog a kennel number.</p><div class="row"><button class="btn primary" data-action="new-entry" data-tab="Kennels">${icon('plus')}Add a kennel</button></div></div>`;
  return `${none.length ? `<div class="note">${icon('info')}<span>${plural(none.length, 'active dog has', 'active dogs have')} no kennel number. Fill them all in at once, or use <b>Move a dog here</b> on a kennel.</span><button class="btn sm" data-action="quick-fill" data-preset="kennel">${icon('sheet')}Fill in kennels</button></div>` : ''}
    ${Object.keys(blocks).map(b => `<section class="grid" style="gap:12px"><h2 class="sec-title">${esc(b)}</h2><div class="kennels">${blocks[b].map(card).join('')}</div></section>`).join('')}`;
}
function openMoveDog(kennel) {
  const options = DOGS.filter(isActive).map(d => `<option value="${esc(d.chip || 'id:' + d.id)}">${esc(`${dogLabel(d)} · now in ${d.kennel ? 'kennel ' + d.kennel : 'no kennel'}`)}</option>`).join('');
  const o = modal('move', {
    title: `Move a dog to kennel ${kennel}`, narrow: true, form: true,
    body: `<div class="form-grid one"><div class="field"><label for="mv-dog">Dog</label><input class="inp" id="mv-dog" list="mv-dogs" placeholder="Type a name, ID or microchip, or scan" autocomplete="off"><datalist id="mv-dogs">${options}</datalist><span class="hint" id="mv-hint">Pick from the list</span></div></div>`,
    foot: `<span class="msg" id="mv-msg"></span><button type="button" class="btn" data-action="close-top">Cancel</button><button type="submit" class="btn primary">Move dog</button>`,
  });
  const input = $('#mv-dog', o.el);
  const resolve = () => { const v = input.value.trim(); return v.startsWith('id:') ? BYID.get(v.slice(3)) : findDog(v) || DOGS.find(d => isActive(d) && (dogLabel(d).toLowerCase() === v.toLowerCase() || d.id.toLowerCase() === v.toLowerCase())); };
  input.addEventListener('input', () => { const d = resolve(); $('#mv-hint', o.el).textContent = d ? `${dogLabel(d)} · ${d.kennel ? 'kennel ' + d.kennel : 'no kennel'} now` : 'Pick from the list'; });
  $('form', o.el).addEventListener('submit', async e => {
    e.preventDefault();
    const d = resolve();
    const msg = $('#mv-msg', o.el);
    if (!d) { msg.textContent = 'Choose a dog from the list.'; msg.className = 'msg err'; return; }
    if (d.kennel === kennel) { msg.textContent = `${dogName(d)} is already in kennel ${kennel}.`; msg.className = 'msg err'; return; }
    const t = S.db[MASTER];
    const c = t.idx.get('Kennel No.');
    if (c == null) { msg.textContent = 'All Breeds has no “Kennel No.” column.'; msg.className = 'msg err'; return; }
    msg.textContent = 'Saving…'; msg.className = 'msg';
    if (!o.job || o.job.dogRow !== d.row.r) o.job = { tab: MASTER, mode: 'edit', row: d.row, dogRow: d.row.r, cols: t.headers.map((h, i) => i).filter(i => t.headers[i]), headers: t.headers, orig: d.row.v.slice(), dog: dogLabel(d) };
    try {
      await saveRow(o.job, [{ h: 'Kennel No.', c, v: kennel, kind: 'text' }]);
      closeTop(true);
      toast(`${dogName(d)} moved to kennel ${kennel}`);
      d.row.v[c] = kennel; rebuild(); renderAll(); scheduleRefresh();
    } catch (err) { msg.textContent = err.userMessage || String(err.message || err); msg.className = 'msg err'; if (err.refresh) scheduleRefresh(500); }
  });
}

/* ───────── breeding ───────── */
function viewBreeding() {
  const dams = DOGS.filter(d => isActive(d) && isFemale(d)).map(d => { const b = breedInfo(d); return { d, b, flags: breedingFlags(d, b) }; });
  const blocked = dams.filter(x => x.flags.some(f => f.sev === 'crit'));
  const exp = dams.filter(x => x.b.expecting).sort((a, b) => a.b.expecting.due - b.b.expecting.due);
  const rules = rulesSummary();
  const expHTML = exp.length ? `<div class="expect">${exp.map(({ d, b }) => { const e = b.expecting; const pct = Math.min(100, e.since / 63 * 100); return `<button class="ex" data-action="open-dog" data-chip="${esc(d.chip)}" data-id="${esc(d.id)}"><span class="eyebrow">Day ${e.since} of about 63</span><b>${esc(dogName(d))}</b><span class="prog" aria-hidden="true"><i style="width:${pct.toFixed(0)}%"></i></span><small>Due around ${longD(e.due)}${e.sire ? ' · sire ' + esc(e.sire) : ''}</small></button>`; }).join('')}</div>`
    : `<div class="empty slim"><p>No dams are expecting. When you record a mating, she appears here with the days along and an estimated due date (about 63 days; confirm with your vet).</p></div>`;
  const rows = dams.sort((a, b) => (a.d.name || '~').localeCompare(b.d.name || '~')).map(({ d, b, flags }) => {
    const crit = flags.filter(f => f.sev === 'crit'), warn = flags.filter(f => f.sev === 'warn');
    const elig = crit.length ? `<span class="pill crit" title="${esc(crit.map(f => f.text).join('; '))}">Not eligible</span>` : warn.length ? `<span class="pill warn" title="${esc(warn.map(f => f.text).join('; '))}">Check</span>` : '<span class="pill ok">Eligible</span>';
    return `<tr class="click" data-action="open-dog" data-chip="${esc(d.chip)}" data-id="${esc(d.id)}" tabindex="0"><td><b class="nm">${nameHTML(d)}</b></td><td>${esc(titleCase(d.breed))}</td><td class="num">${esc(ageText(d.dob))}</td>
      <td>${b.expecting ? `<span class="pill acc">Expecting · day ${b.expecting.since}</span>` : '<span class="pill">Open</span>'}</td>
      <td class="num">${b.litters} <span class="muted">(${b.litters12} in 12 mo)</span></td><td class="num">${b.csec}</td><td class="num">${b.lastWhelp ? dmy(b.lastWhelp) : '<span class="muted">—</span>'}</td>
      <td class="num">${b.nextHeat ? dmy(b.nextHeat) : '<span class="muted">—</span>'}</td><td>${elig}${crit.length || warn.length ? `<div class="why">${esc((crit[0] || warn[0]).text)}</div>` : ''}</td></tr>`;
  }).join('');
  return `
  <div class="note">${icon('info')}<span>${rules.length ? `Your rules: ${esc(rules.join(' · '))}.` : 'No breeding rules are set.'} <button class="linkbtn" data-action="nav" data-view="settings" data-anchor="rules">Change rules</button></span></div>
  <p class="lede">${plural(dams.length, 'active female')} · ${dams.length - blocked.length} eligible · ${exp.length} expecting.</p>
  <section class="grid" style="gap:10px"><h2 class="sec-title">Expecting</h2>${expHTML}</section>
  <section class="grid" style="gap:10px"><h2 class="sec-title">Dams</h2>
  <div class="table-wrap"><table><thead><tr><th>Name</th><th>Breed</th><th>Age</th><th>Now</th><th>Litters</th><th>C-sections</th><th>Last whelp</th><th>Next heat (est.)</th><th>Eligibility</th></tr></thead><tbody>${rows || '<tr><td colspan="9" class="muted">No active females.</td></tr>'}</tbody></table></div></section>
  <section class="grid" style="gap:10px"><h2 class="sec-title">Breeding records</h2>${logCards('breeding')}</section>`;
}

/* ───────── records ───────── */
function logCards(group) {
  return `<div class="cards">${LOGS.filter(l => l.group === group).map(L => {
    const t = S.db[L.tab];
    if (!t) return `<div class="card"><h3>${esc(L.label)}</h3><div class="meta">No “${esc(L.tab)}” tab in the sheet</div></div>`;
    const dated = L.date ? t.rows.map(r => parseDate(cell(t, r, L.date))).filter(Boolean).sort((a, b) => b - a) : [];
    return `<div class="card"><h3>${esc(L.label)}</h3><div class="meta">${plural(t.rows.length, 'entry', 'entries')}${dated[0] ? ` · latest ${dmy(dated[0])}` : ''}</div>
      <div class="acts"><button class="btn sm" data-action="nav" data-view="log" data-tab="${esc(L.tab)}">Open</button>${L.readOnly ? '<span class="pill">From your Google Form</span>' : `<button class="btn sm ghost" data-action="new-entry" data-tab="${esc(L.tab)}">${icon('plus')}New</button>`}${L.bulk ? `<button class="btn sm ghost" data-action="bulk" data-tab="${esc(L.tab)}">${icon('many')}Many</button>` : ''}</div></div>`;
  }).join('')}</div>`;
}
function viewRecords() {
  return ['health', 'breeding', 'movements', 'facility'].map(g => `<section class="grid" style="gap:10px" aria-labelledby="rg-${g}"><div><h2 class="sec-title" id="rg-${g}">${esc(GROUPS[g].label)}</h2><p class="lede small">${esc(GROUPS[g].lede)}</p></div>${logCards(g)}</section>`).join('');
}
function viewLog() {
  const L = LOG[S.tab] || { tab: S.tab, label: S.tab, noun: 'entry' };
  const t = S.db[S.tab];
  if (!t) return `<div class="empty"><h2>No “${esc(S.tab)}” tab</h2><p>The sheet doesn’t have a tab with this name. If it was renamed, rename it back so the app can find it.</p></div>`;
  return `<div class="toolbar"><button class="btn sm ghost" data-action="nav" data-view="records">${icon('back')}All records</button>
    <label class="search"><span class="sr">Search ${esc(L.label)}</span>${icon('search')}<input class="inp" id="log-q" placeholder="Search ${esc(L.label.toLowerCase())}" value="${esc(S.logQ)}" autocomplete="off"></label>
    <span class="count" id="log-count" aria-live="polite"></span></div>
    <p class="lede small">Sheet tab: <b>${esc(t.name)}</b>${L.readOnly ? ' · filled by your Google Form, so it is read-only here' : ' · choose an entry to edit it'}</p>
    <div id="log-table"></div>`;
}
function logTableHTML() {
  const L = LOG[S.tab] || { tab: S.tab, noun: 'entry' };
  const t = S.db[S.tab];
  if (!t) return { count: 0, html: '' };
  const q = S.logQ.trim().toLowerCase();
  const dc = L.date ? t.idx.get(L.date) : undefined;
  let rows = t.rows.filter(r => !q || r.v.join(' ').toLowerCase().includes(q));
  if (dc != null) rows = rows.slice().sort((a, b) => (parseDate(b.v[dc]) || 0) - (parseDate(a.v[dc]) || 0));
  const cols = t.headers.map((h, c) => ({ h, c })).filter(x => x.h);
  if (t.rows.length && isPhone()) {
    // on a phone: one line per entry, newest first, with the dog's name when the entry has a microchip
    const items = rows.map(r => {
      const ev = { L, t, row: r };
      const date = dc != null ? parseDate(r.v[dc]) : null;
      const ch = firstChip(ev), dog = ch && BYCHIP.get(ch);
      const parts = eventSummary(ev).split(' · ').filter(Boolean);
      const title = dog ? dogName(dog) : ch || parts.shift() || cap(L.noun);
      const sub = parts.join(' · ');
      return `<li><button class="li${dc == null ? ' nodate' : ''}" data-action="edit-row" data-tab="${esc(t.name)}" data-r="${r.r}">${dc != null ? `<span class="d">${date ? shortD(date) : '—'}</span>` : ''}<span class="t"><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>${icon('chev', 'muted')}</button></li>`;
    }).join('');
    return { count: rows.length, html: rows.length ? `<ul class="loglist panel" aria-label="${esc(L.label || t.name)}">${items}</ul>` : `<div class="empty slim"><p>No entries match “${esc(S.logQ)}”.</p></div>` };
  }
  if (!t.rows.length) return { count: 0, html: `<div class="empty"><h2>No ${esc(L.noun)} records yet</h2><p>${L.readOnly ? 'Responses from your Google Form will appear here.' : `Add the first one and it is saved to the “${esc(t.name)}” tab.`}</p>${L.readOnly ? '' : `<div class="row"><button class="btn primary" data-action="new-entry" data-tab="${esc(t.name)}">${icon('plus')}New ${esc(L.noun)}</button>${L.bulk ? `<button class="btn" data-action="bulk" data-tab="${esc(t.name)}">${icon('many')}Log for many dogs</button>` : ''}</div>`}</div>` };
  const body = rows.map(r => `<tr class="click" data-action="edit-row" data-tab="${esc(t.name)}" data-r="${r.r}" tabindex="0">${cols.map(({ c }) => {
    const k = t.kinds[c], v = r.v[c] || '';
    if (k === 'chip') { const ch = normChip(v); const d = BYCHIP.get(ch); return `<td>${chipHTML(ch)}${d ? `<span class="sub">${esc(dogName(d))}</span>` : ''}</td>`; }
    if (k === 'url' && /^https?:\/\//i.test(v)) return `<td><a href="${esc(v)}" target="_blank" rel="noopener">Open</a></td>`;
    if (k === 'long') return `<td class="wrap">${esc(v)}</td>`;
    return `<td class="${k === 'date' || k === 'number' ? 'num' : ''}">${esc(fmtVal(v, k))}</td>`;
  }).join('')}</tr>`).join('');
  return { count: rows.length, html: `<div class="table-wrap"><table><thead><tr>${cols.map(({ h }) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">No entries match “${esc(S.logQ)}”.</td></tr>`}</tbody></table></div>` };
}
function refreshLogTable() {
  const box = $('#log-table'); if (!box) return;
  const r = logTableHTML(); box.innerHTML = r.html;
  const c = $('#log-count'); if (c) c.textContent = plural(r.count, 'entry', 'entries');
}
