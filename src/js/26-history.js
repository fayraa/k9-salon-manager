/* ───────── history: every change saved in the app, with who made it ───────── */
const HIST_KINDS = [['', 'All changes'], ['Added', 'New records'], ['Edited', 'Edits'], ['files', 'Photos and documents'], ['Settings', 'Settings']];
const HIST_MAX = 300;
const PHOTO_TAB_NAME = 'App Photos', DOC_TAB_NAME = 'App Documents'; // the bridge's own tabs, named in the log

/** The change log, newest first, with the lines of one save (one row, one person, one minute) put together. */
function historyEntries() {
  const t = S.db && S.db[CHANGE_TAB];
  if (!t) return [];
  const g = (r, h) => String(cell(t, r, h) == null ? '' : cell(t, r, h)).trim();
  const out = [];
  let last = null;
  for (const r of t.rows) {
    const e = { time: g(r, 'Time'), who: g(r, 'Person'), act: g(r, 'Action'), tab: g(r, 'Tab'), row: g(r, 'Row'), dog: g(r, 'Dog') };
    const line = { field: g(r, 'Field'), before: g(r, 'Before'), after: g(r, 'After') };
    const key = [e.time, e.who, e.act, e.tab, e.row, e.dog].join('|');
    if (last && last.key === key && e.act === 'Edited') { last.lines.push(line); continue; }
    last = Object.assign(e, { key, lines: [line] });
    out.push(last);
  }
  return out.reverse();
}
const histWho = e => e.who || 'Someone';
/** The dog a change was about, when it's still on record: the log keeps the name and animal ID, or the microchip. */
function histDog(label) {
  if (!label) return null;
  const chip = normChip(label);
  if (chip.length >= 9 && chip === label.replace(/\s/g, '')) return BYCHIP.get(chip) || null;
  const id = (label.match(/\(([^()]+)\)\s*$/) || [])[1];
  if (id && BYID.get(id)) return BYID.get(id);
  const same = DOGS.filter(d => dogLabel(d) === label || dogName(d) === label);
  return same.length === 1 ? same[0] : null;
}
function histNoun(tab) {
  if (tab === MASTER) return 'dog';
  if (tab === PHOTO_TAB_NAME) return 'photo';
  const L = LOG[tab];
  return L ? L.noun : `${tab} row`;
}
function histMatches(e, f) {
  if (f.who && histWho(e) !== f.who) return false;
  if (f.kind === 'files' ? !['Photo', 'Document', 'Removed'].includes(e.act) : f.kind && e.act !== f.kind) return false;
  if (f.q) {
    const text = [e.time, histWho(e), e.act, e.tab, e.dog, ...e.lines.flatMap(l => [l.field, l.before, l.after])].join(' ').toLowerCase();
    if (!f.q.split(/\s+/).every(w => text.includes(w))) return false;
  }
  return true;
}
function histDay(time) {
  const d = parseDate(time);
  if (!d) return 'Earlier';
  const n = diffDays(d);
  if (n === 0) return 'Today';
  if (n === -1) return 'Yesterday';
  return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()]} ${longD(d)}`;
}
const histTime = time => (String(time).match(/\b(\d{1,2}:\d{2})\b/) || [])[1] || '';
function histEntryHTML(e) {
  const d = histDog(e.dog);
  const dogBit = e.dog ? (d ? `<button class="linkbtn" data-action="open-dog" data-chip="${esc(d.chip)}" data-id="${esc(d.id)}">${esc(dogName(d))}</button>` : `<b>${esc(e.dog)}</b>`) : '';
  const noun = histNoun(e.tab);
  const a = /^[aeiou]/i.test(noun) ? 'an' : 'a';
  const isDog = e.tab === MASTER;
  let what, lines = '';
  if (e.act === 'Added') {
    what = isDog ? `added ${dogBit || 'a dog'}` : `added ${a} ${esc(noun)}${dogBit ? ` for ${dogBit}` : ''}`;
    const sum = e.lines[0].after;
    if (sum) lines = `<p class="he-sum">${esc(sum)}</p>`;
  } else if (e.act === 'Edited') {
    what = isDog ? `changed ${dogBit ? `${dogBit}’s details` : 'a dog’s details'}` : `changed ${a} ${esc(noun)}${dogBit ? ` for ${dogBit}` : ''}`;
    lines = `<ul class="he-ch">${e.lines.map(l => `<li><span class="f">${esc(l.field || 'A value')}</span> <span class="before">${esc(l.before || 'blank')}</span> <span aria-hidden="true">→</span><span class="sr">changed to</span> <b>${esc(l.after || 'blank')}</b></li>`).join('')}</ul>`;
  } else if (e.act === 'Photo') {
    what = `added a photo${dogBit ? ` of ${dogBit}` : ''}`;
  } else if (e.act === 'Document') {
    what = `added a document${dogBit ? ` for ${dogBit}` : ''}`;
    if (e.lines[0].field) lines = `<p class="he-sum">${esc(e.lines[0].field)}</p>`;
  } else if (e.act === 'Removed') {
    what = `removed a document${dogBit ? ` for ${dogBit}` : ''}`;
    if (e.lines[0].field) lines = `<p class="he-sum">${esc(e.lines[0].field)}</p>`;
  } else if (e.act === 'Settings') {
    what = 'changed the app settings';
    if (e.lines[0].after) lines = `<p class="he-sum">${esc(e.lines[0].after)}</p>`;
  } else {
    what = `${esc(e.act.toLowerCase() || 'changed')} ${esc(e.tab)}${dogBit ? ` · ${dogBit}` : ''}`;
  }
  const where = e.tab && !isDog && e.tab !== PHOTO_TAB_NAME && e.tab !== DOC_TAB_NAME ? `${esc(e.tab)}${e.row ? `, row ${esc(e.row)}` : ''}` : '';
  return `<li class="he"><div class="he-h"><span class="he-t"><b>${esc(histWho(e))}</b> ${what}</span><time>${esc(histTime(e.time))}</time></div>${lines}${where ? `<p class="he-w">${where}</p>` : ''}</li>`;
}
function historyListHTML() {
  const f = { q: (S.histQ || '').trim().toLowerCase(), who: S.histWho || '', kind: S.histKind || '' };
  const all = historyEntries();
  const shown = all.filter(e => histMatches(e, f));
  if (!shown.length) return { count: 0, html: `<div class="empty slim"><p>${all.length ? 'No changes match.' : 'No changes yet.'}</p></div>` };
  const days = [];
  shown.slice(0, HIST_MAX).forEach(e => { const day = histDay(e.time); if (!days.length || days[days.length - 1].day !== day) days.push({ day, items: [] }); days[days.length - 1].items.push(e); });
  return {
    count: shown.length,
    html: days.map((d, i) => `<section class="hday" aria-labelledby="hd-${i}"><h2 class="sec-title" id="hd-${i}">${esc(d.day)}</h2><ul class="hist panel">${d.items.map(histEntryHTML).join('')}</ul></section>`).join('')
      + (shown.length > HIST_MAX ? `<p class="muted small">The latest ${HIST_MAX} are shown. Search or choose a person to see others.</p>` : ''),
  };
}
function viewHistory() {
  if (S.bridgeVersion < NEED_BRIDGE) return `<div class="empty"><h2>History needs the bridge update</h2><p>Once your bridge script is updated, every save made in the app is listed here, with who made it and what changed.</p>${WEB ? '<p>Update it from K-9 Salon Manager on the computer: Settings, then Connection.</p>' : '<div class="row"><button class="btn primary" data-action="bridge-help">Show me how</button></div>'}</div>`;
  const people = Array.from(new Set(historyEntries().map(histWho))).sort((a, b) => a.localeCompare(b));
  if (S.histWho && !people.includes(S.histWho)) S.histWho = '';
  const noName = !S.prefs.who ? `<div class="note">${icon('info')}<span>Your changes are listed as “Someone” until you add your name.</span><button class="btn sm" data-action="nav" data-view="settings" data-anchor="you">Add your name</button></div>` : '';
  return `${noName}<div class="toolbar">
    <label class="search"><span class="sr">Search changes</span>${icon('search')}<input class="inp" id="hist-q" placeholder="Search by dog, record or value" value="${esc(S.histQ || '')}" autocomplete="off"></label>
    <label class="sr" for="hist-who">Person</label><select class="sel" id="hist-who"><option value="">Everyone</option>${people.map(p => `<option ${p === S.histWho ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    <label class="sr" for="hist-kind">Kind of change</label><select class="sel" id="hist-kind">${HIST_KINDS.map(([k, l]) => `<option value="${k}" ${k === (S.histKind || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <span class="count" id="hist-count" aria-live="polite"></span></div>
    <p class="lede small">Every change saved in the app, newest first. Changes typed straight into the Google Sheet aren’t listed: the sheet’s own File → Version history shows those. The full list is in the “${esc(CHANGE_TAB)}” tab.</p>
    <div id="hist-list"></div>`;
}
function refreshHistory() {
  const box = $('#hist-list'); if (!box) return;
  const r = historyListHTML();
  box.innerHTML = r.html;
  const c = $('#hist-count'); if (c) c.textContent = plural(r.count, 'change');
}
function afterHistory() {
  refreshHistory();
  const q = $('#hist-q'), who = $('#hist-who'), kind = $('#hist-kind');
  if (q) q.addEventListener('input', () => { S.histQ = q.value; refreshHistory(); });
  if (who) who.addEventListener('change', () => { S.histWho = who.value; refreshHistory(); });
  if (kind) kind.addEventListener('change', () => { S.histKind = kind.value; refreshHistory(); });
}
