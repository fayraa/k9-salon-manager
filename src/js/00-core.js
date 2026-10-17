/* ───────── constants ───────── */
const MASTER = 'All Breeds';
const CHANGE_TAB = 'App Change Log';
const NEED_BRIDGE = 2;   // the app needs at least this bridge version
const BRIDGE_LATEST = 3; // the newest bridge: older ones still work, the app suggests updating
const EPOCH = Date.UTC(1899, 11, 30);
const NOW = new Date();
const TODAY = new Date(Date.UTC(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage off */ } },
};

const LOGS = [
  { tab: 'Vaccinations', group: 'health', label: 'Vaccinations', noun: 'vaccination', date: 'Date Given', due: 'Next Due Date', bulk: true, sum: ['Vaccine Type', 'Clinic', 'Administering Vet'] },
  { tab: 'Parasite Treatments', group: 'health', label: 'Parasite treatments', noun: 'parasite treatment', date: 'Date', due: 'Next Due Date', bulk: true, sum: ['Treatment Type', 'Product Name', 'Dosage'] },
  { tab: 'Daily Health Monitoring', group: 'health', label: 'Daily health checks', noun: 'daily health check', date: 'Date', bulk: true, sum: ['General', 'Fit for Breeding', 'Remarks'] },
  { tab: 'Annual Health Checks', group: 'health', label: 'Annual health checks', noun: 'annual health check', date: 'Exam Date', bulk: true, sum: ['General Condition', 'Fit for Breeding', 'Vet Name'] },
  { tab: 'Veterinary Treatments', group: 'health', label: 'Vet treatments', noun: 'vet treatment', date: 'Date', bulk: true, sum: ['Treatment Provided', 'Vet Clinic'] },
  { tab: 'Sterilisations', group: 'health', label: 'Sterilisations', noun: 'sterilisation', date: 'Procedure Date', bulk: true, sum: ['Reason', 'Clinic'] },
  { tab: 'Mating Records', group: 'breeding', label: 'Matings', noun: 'mating', date: 'Date of Mating', sum: ['Sire #1 Name', 'Successful', 'Expected Whelp Date'] },
  { tab: 'Heat Cycles', group: 'breeding', label: 'Heat cycles', noun: 'heat cycle', date: 'Onset Date (Proestrus)', sum: ['Heat No.', 'Est. Next Heat'] },
  { tab: 'Puppies Bred In-House', group: 'breeding', label: 'Litters', noun: 'litter', date: 'Litter DOB', sum: ['No. of Puppies', 'Delivery Method', 'Sex Breakdown'] },
  { tab: 'Breeding Dog Movement', group: 'movements', label: 'Breeding dog movements', noun: 'dog movement', date: 'Date In', bulk: true, sum: ['Reason', 'Kennel (From)', 'Kennel (To)'] },
  { tab: 'Retail Puppy Movement', group: 'movements', label: 'Retail puppy movements', noun: 'puppy movement', date: 'Date In', sum: ['Breed', 'Source Name / Country', 'Status'] },
  { tab: 'Deaths', group: 'movements', label: 'Deaths', noun: 'death', date: 'Date of Death', sum: ['Cause of Death', 'Vet Confirmation'] },
  { tab: 'Death Certificates', group: 'movements', label: 'Death certificates', noun: 'death certificate', date: 'Date Issued', sum: ['Certificate No.', 'Issuing Vet'] },
  { tab: 'Staff Register', group: 'facility', label: 'Staff', noun: 'staff member', sum: ['Staff Name', 'Role / Duties', 'Status'] },
  { tab: 'Staff Training', group: 'facility', label: 'Staff training', noun: 'training record', date: 'Date Completed', due: 'Refresher Due (3yr)', sum: ['Staff Name', 'Course Name', 'Institution'] },
  { tab: 'Visitor Log', group: 'facility', label: 'Visitors', noun: 'visit', date: 'Date', sum: ['Visitor Name', 'Purpose of Visit'] },
  { tab: 'Form_Responses', group: 'facility', label: 'Visitor declarations', noun: 'declaration', date: 'Timestamp', readOnly: true, sum: ['Name', 'Reasons for visiting'] },
  { tab: 'AVS Submissions', group: 'facility', label: 'AVS submissions', noun: 'AVS submission', date: 'Date Submitted', sum: ['Month', 'Submitted By'] },
  { tab: 'Kennels', group: 'facility', label: 'Kennels', noun: 'kennel', sum: ['Block', 'Type', 'Capacity'] },
  { tab: 'Farm Info', group: 'facility', label: 'Farm details', noun: 'farm detail', sum: ['Field', 'Value'] },
];
const LOG = Object.fromEntries(LOGS.map(l => [l.tab, l]));
const GROUPS = {
  health: { label: 'Health', lede: 'Vaccinations, parasite control, health checks and vet records.' },
  breeding: { label: 'Breeding', lede: 'Heat cycles, matings and litters bred on site.' },
  movements: { label: 'Movements', lede: 'Dogs and puppies coming in and going out, and death records.' },
  facility: { label: 'Farm', lede: 'Farm details, kennels, staff, visitors and AVS submissions.' },
};
const NAV = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'dogs', label: 'Dogs', icon: 'paw' },
  { id: 'breeding', label: 'Breeding', icon: 'heart' },
  { id: 'records', label: 'Records', icon: 'list' },
  { id: 'reports', label: 'Reports', icon: 'report' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];
const EXAM = ['Normal', 'Abnormal — see remarks'];
const PRESET = {
  'Vaccine Type': ['DHPPi', 'DHPPi + Lepto', 'Leptospirosis', 'Rabies', 'Kennel cough (Bordetella)'],
  'Treatment Type': ['Deworming', 'Flea & tick', 'Heartworm prevention'],
  'Delivery Method': ['Natural', 'C-section'],
  'Source Type': ['Bred in-house', 'Local breeder', 'Imported'],
  'Discharge Colour': ['Bloody', 'Pink', 'Straw', 'None'],
  'Vulva Swelling': ['None', 'Mild', 'Moderate', 'Marked'],
  'Flagging / Accepts Male': ['No', 'Flagging', 'Accepts male'],
  'Vaccination Status': ['Up to date', 'Due', 'Overdue', 'Not vaccinated'],
  'Type': ['Breeding', 'Whelping', 'Puppy', 'Isolation', 'Retired'],
};
['General', 'Skin/Eyes/Ears/Oral/Nasal', 'Limbs', 'Heart/Lungs', 'General Condition', 'Posture & Gait', 'Eyes', 'Ears', 'Oral Health', 'Heart', 'Lungs', 'Spine/Tail', 'Anus/Vulva/Penis', 'Mammary Glands'].forEach(h => { PRESET[h] = EXAM; });
const STATUS_OPTS = ['Active', 'Retired', 'Adopted', 'Sold', 'Deceased', 'Transferred'];
const STAFF_COLS = /^(administered by|person met|submitted by)$/i;
const VET_COLS = /^(vet clinic|clinic|clinic \/ stamp|attending vet|administering vet|performing vet|issuing vet|vet name)$/i;
const KENNEL_COLS = /^(kennel no\.|kennel \(from\)|kennel \(to\))$/i;
const SEQ_COL = /^s\/?n\.?$|^s\/no\.?$/i;
const CALC = {
  'Mating Records': { 'Expected Whelp Date': ['Date of Mating', { days: 63 }] },
  'Heat Cycles': {
    'Est. Fertile Window Start': ['Onset Date (Proestrus)', { days: 9 }],
    'Est. Fertile Window End': ['Onset Date (Proestrus)', { days: 14 }],
    'Est. Next Heat': ['Onset Date (Proestrus)', { months: 6 }],
  },
  'Staff Training': { 'Refresher Due (3yr)': ['Date Completed', { months: 36 }] },
};
const SHORTCUTS = {
  'Next Due Date': [['+3 weeks', { days: 21 }], ['+3 months', { months: 3 }], ['+1 year', { months: 12 }]],
  'Next Vaccination Date': [['+3 weeks', { days: 21 }], ['+1 year', { months: 12 }]],
  'Licence Expiry': [['+1 year', { months: 12 }]],
};
const CC = { '702': 'Singapore', '410': 'South Korea', '156': 'China', '764': 'Thailand', '458': 'Malaysia', '392': 'Japan', '158': 'Taiwan', '840': 'United States', '036': 'Australia', '826': 'United Kingdom', '344': 'Hong Kong', '608': 'Philippines', '360': 'Indonesia', '704': 'Vietnam', '643': 'Russia', '250': 'France', '276': 'Germany', '380': 'Italy', '528': 'Netherlands', '124': 'Canada' };
const ISSUE = {
  licence: { label: 'Licence number missing or expiring', short: 'Licence' },
  healthcheck: { label: 'Annual health check due', short: 'Health check' },
  vacc: { label: 'Vaccination due', short: 'Vaccine' },
  parasite: { label: 'Parasite treatment due', short: 'Parasite' },
  breeding: { label: 'Breeding limit reached', short: 'Breeding' },
  sterilise: { label: 'Retired and not sterilised', short: 'Sterilise' },
  deceased: { label: 'In Deaths tab but still marked active', short: 'Status' },
  chip: { label: 'Microchip number to check', short: 'Chip' },
};
const DEFAULT_SHARED = {
  checks: { licence: true, healthcheck: true, sterilise: true },
  dueSoonDays: 14,
  breeding: { minAgeMonths: 12, maxLittersPer12Months: null, maxLitters: null, maxCsections: null, retireAgeYears: null, minMonthsBetweenLitters: null },
  reminders: { enabled: false, hour: 8, extra: '' },
};
const DEFAULT_PREFS = { url: '', key: '', who: '', textSize: 1, contrast: 'normal', theme: 'system', notify: true, autoUpdate: true, scanner: { serial: false, baud: 115200, port: null } };

/* ───────── state ───────── */
const S = {
  db: null, sheetTitle: '', sheetUrl: '', bridgeVersion: 0,
  shared: clone(DEFAULT_SHARED), photos: {}, reminders: { installed: false },
  prefs: clone(DEFAULT_PREFS), version: '',
  view: 'home', tab: null, reportTab: 'monthly', dogsMode: 'list',
  dogs: { status: 'active', breed: '', sex: '', q: '', issue: '', sort: 'id', dir: 1 },
  logQ: '', changeQ: '',
  conn: { state: 'starting', code: '', msg: '', at: 0 },
  poll: null, saving: false, update: { state: 'idle' }, scanner: { state: 'off', name: '' },
};
let DOGS = [], BYCHIP = new Map(), BYID = new Map(), IDX = { byChip: new Map(), events: [] };

/* ───────── utilities ───────── */
function clone(x) { return JSON.parse(JSON.stringify(x)); }
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const pad = n => String(n).padStart(2, '0');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const isoD = d => d ? `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` : '';
const dmy = d => d ? `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` : '';
const longD = d => d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
const shortD = d => d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${d.getUTCFullYear() !== TODAY.getUTCFullYear() ? ' ' + d.getUTCFullYear() : ''}` : '';
function parseDate(s) {
  if (!s) return null;
  if (s instanceof Date) return s;
  s = String(s).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; const d = +m[1], mo = +m[2]; if (mo > 12 && d <= 12) return new Date(Date.UTC(y, d - 1, mo)); return new Date(Date.UTC(y, mo - 1, d)); }
  return null;
}
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
function addMonths(d, n) { const y = d.getUTCFullYear(), mo = d.getUTCMonth() + n, day = d.getUTCDate(); const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); return new Date(Date.UTC(y, mo, Math.min(day, last))); }
const shift = (d, s) => s.months ? addMonths(d, s.months) : addDays(d, s.days || 0);
const diffDays = d => Math.round((d - TODAY) / 864e5);
function monthsBetween(a, b) { let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()); if (b.getUTCDate() < a.getUTCDate()) m--; return m; }
function ageMonths(dob) { return dob ? monthsBetween(dob, TODAY) : null; }
const ageDays = dob => dob ? Math.round((TODAY - dob) / 864e5) : null;
function ageText(dob) {
  if (!dob) return '';
  const m = ageMonths(dob);
  if (m < 3) { const w = Math.floor(ageDays(dob) / 7); return `${w} week${w === 1 ? '' : 's'}`; }
  return m < 12 ? `${m} months` : `${Math.floor(m / 12)}y ${m % 12}m`;
}
const normChip = s => String(s == null ? '' : s).replace(/\D/g, '');
const truthy = s => /^(y|yes|true|1|done|sterilised|desexed|✓)$/i.test(String(s).trim());
const clock = ms => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const serialToDate = n => new Date(EPOCH + Math.floor(n) * 864e5);
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const titleCase = s => String(s).toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
const userErr = (m, extra) => Object.assign(new Error(m), { userMessage: m }, extra || {});
const sleep = ms => new Promise(r => setTimeout(r, ms));

const IC = {
  home: '<path d="M3.5 11.5 12 4.5l8.5 7"/><path d="M6 10v9.5h12V10"/><path d="M10 19.5v-5h4v5"/>',
  paw: '<circle cx="6.5" cy="10" r="1.7"/><circle cx="10" cy="6.3" r="1.7"/><circle cx="14.6" cy="6.6" r="1.7"/><circle cx="17.8" cy="10.6" r="1.6"/><path d="M8.3 17.6c0-3 2.1-5.6 4.3-5.6s4.3 2.5 4.3 5.1c0 1.7-1.4 2.6-3 2.2-.9-.2-1.6-.4-2.4 0-1.6.7-3.2-.1-3.2-1.7z"/>',
  heart: '<path d="M12 19.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.1a4.2 4.2 0 0 1 7.5 2.3c0 5.5-7.5 10.1-7.5 10.1z"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="5" cy="6.5" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="17.5" r="1"/>',
  report: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8h5"/><path d="M9.5 16.5v-3M12.5 16.5v-5M15.5 16.5v-2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M5 15.5V6a1 1 0 0 1 1-1h9.5"/>',
  sync: '<path d="M19.5 10.5A7.7 7.7 0 0 0 5.8 7.2L4.3 9"/><path d="M4.3 4.8V9h4.2"/><path d="M4.5 13.5a7.7 7.7 0 0 0 13.7 3.3l1.5-1.8"/><path d="M19.7 19.2V15h-4.2"/>',
  edit: '<path d="M4.5 19.5h4l10.3-10.3-4-4L4.5 15.5z"/><path d="m13.3 6.7 4 4"/>',
  ext: '<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v5.5H4.5V6H10"/>',
  scan: '<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3"/><path d="M7.5 12h9"/>',
  sheet: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><path d="M4.5 9h15M4.5 14.5h15M10 9v11.5"/>',
  many: '<rect x="3.5" y="7.5" width="12" height="12" rx="2"/><path d="M8 4.5h10.5a2 2 0 0 1 2 2V17"/><path d="m6.5 13.5 2 2 4-4"/>',
  litter: '<circle cx="8" cy="9" r="3"/><circle cx="16.5" cy="9" r="2.3"/><path d="M3.5 19c.6-3 2.4-4.6 4.5-4.6s3.9 1.6 4.5 4.6"/><path d="M13 18.5c.5-2.3 1.8-3.6 3.5-3.6s3 1.3 3.5 3.6"/>',
  pdf: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14 3.5V8h5"/><path d="M9 13h6M9 16.5h4"/>',
  camera: '<path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10.5H4z"/><circle cx="12" cy="13.5" r="3.3"/>',
  bell: '<path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2H5z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  move: '<path d="M4 12h16M15 7l5 5-5 5"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${IC[n] || ''}</svg>`;

/* ───────── field typing ───────── */
function kindOf(h, tab) {
  if (/^puppy microchips$/i.test(h)) return 'long';
  if (/microchip/i.test(h)) return 'chip';
  if (/^time (in|out)$/i.test(h)) return 'time';
  if (/^timestamp$|date and time/i.test(h)) return 'datetime';
  if (/link$/i.test(h)) return 'url';
  if (/(^|\s)(date|dob)\b|date$|\bdue\b|onset|window (start|end)|next heat|expiry/i.test(h)) return 'date';
  if (/^(sex|gender)$/i.test(h)) return 'sex';
  if (/^(fit for breeding|successful|progesterone tested|vet confirmation|certificate issued|sterilised)$/i.test(h)) return 'yesno';
  if (tab === MASTER && h === 'Status') return 'status';
  if (/^(no\. of puppies|heat no\.|litter no\.|capacity)$/i.test(h)) return 'number';
  if (/(remarks|notes|comments|treatment provided|cause of death|sex breakdown|role \/ duties|reasons for visiting)$/i.test(h)) return 'long';
  return 'text';
}
function fmtVal(v, kind) {
  if (v === '' || v == null) return '';
  if (kind === 'date') { const d = parseDate(v); return d ? dmy(d) : v; }
  if (kind === 'datetime') { const d = parseDate(v); const t = String(v).match(/\d{1,2}:\d{2}/); return d ? dmy(d) + (t ? ' ' + t[0] : '') : v; }
  if (kind === 'yesno') return v === 'TRUE' ? 'Yes' : v === 'FALSE' ? 'No' : v;
  return v;
}

/* ───────── bridge payload → tables ───────── */
function parseBridge(res) {
  const tabs = {};
  for (const name of Object.keys(res.tabs || {})) {
    const x = res.tabs[name];
    const t = { name, rowCount: x.maxRows || 1000, headers: (x.headers || []).map(h => String(h == null ? '' : h).trim()), idx: new Map(), kinds: [], rows: [], lastRow: x.lastRow || 1, types: [], formulaCols: new Set(x.formulaCols || []), rules: x.rules && typeof x.rules === 'object' ? x.rules : {} };
    t.headers.forEach((h, c) => { if (h && !t.idx.has(h)) t.idx.set(h, c); });
    t.kinds = t.headers.map(h => kindOf(h, name));
    for (const row of x.rows || []) {
      const v = (row.v || []).map((val, c) => {
        if (val === '' || val == null) return '';
        const ty = t.types[c] || (t.types[c] = { s: 0, n: 0, b: 0 });
        if (typeof val === 'boolean') { ty.b++; return val ? 'TRUE' : 'FALSE'; }
        if (typeof val === 'number') { ty.n++; return t.kinds[c] === 'date' ? isoD(serialToDate(val)) : String(val); }
        ty.s++; return String(val);
      });
      while (v.length < t.headers.length) v.push('');
      t.rows.push({ r: row.r, v });
    }
    tabs[name] = t;
  }
  return tabs;
}
const cell = (t, row, h) => { const c = t && t.idx.get(h); return c == null || !row ? '' : (row.v[c] || ''); };

/* ───────── derived data ───────── */
function rebuild() {
  const t = S.db && S.db[MASTER];
  DOGS = []; BYCHIP = new Map(); BYID = new Map();
  if (t) {
    for (const row of t.rows) {
      const g = h => cell(t, row, h);
      const d = {
        row, id: g('Animal ID'), chip: normChip(g('Microchip No.')), name: g('Name'), breed: g('Breed'), colour: g('Colour'),
        sex: g('Sex'), dob: parseDate(g('Date of Birth')), sterilised: g('Sterilised'), premise: g('Premise'), kennel: String(g('Kennel No.')).trim(),
        status: g('Status'), remarks: g('Remarks'), nextVacc: parseDate(g('Next Vaccination Date')),
        source: g('Source'), dam: normChip(g('Dam Microchip')), sire: normChip(g('Sire Microchip')), pals: g('PALS Licence No.'), palsExp: parseDate(g('Licence Expiry')),
      };
      if (!d.id && !d.chip && !d.name) continue;
      d.key = d.chip || (d.id ? 'id:' + d.id : '');
      DOGS.push(d);
      if (d.chip && !BYCHIP.has(d.chip)) BYCHIP.set(d.chip, d);
      if (d.id && !BYID.has(d.id)) BYID.set(d.id, d);
    }
  }
  IDX = { byChip: new Map(), events: [] };
  for (const L of LOGS) {
    const lt = S.db && S.db[L.tab];
    if (!lt) continue;
    const chipCols = lt.headers.map((h, c) => [h, c]).filter(([h, c]) => h && lt.kinds[c] === 'chip');
    const dc = L.date ? lt.idx.get(L.date) : undefined;
    for (const row of lt.rows) {
      const ev = { L, t: lt, row, date: dc != null ? parseDate(row.v[dc]) : null };
      IDX.events.push(ev);
      for (const [h, c] of chipCols) {
        const ch = normChip(row.v[c]);
        if (!ch) continue;
        const list = IDX.byChip.get(ch) || [];
        list.push({ ev, role: h.replace(/microchip.*$/i, '').trim().toLowerCase() });
        IDX.byChip.set(ch, list);
      }
    }
  }
  for (const d of DOGS) d.issues = dogIssues(d);
}
const findDog = (chip, id) => (chip && BYCHIP.get(normChip(chip))) || (id && BYID.get(id)) || null;
const evsFor = (chip, tab, role) => !chip ? [] : (IDX.byChip.get(chip) || []).filter(x => (!tab || x.ev.L.tab === tab) && (role == null || x.role === role)).map(x => x.ev).filter((e, i, a) => a.indexOf(e) === i).sort((a, b) => (b.date || 0) - (a.date || 0));
const isActive = d => /^active/i.test(d.status);
const isRetired = d => /retired/i.test(d.status);
const isAdopted = d => /^adopted/i.test(d.status);
const isFemale = d => /^f/i.test(d.sex);
const isMale = d => /^m/i.test(d.sex);
const onBreedingPremise = d => /breeding/i.test(d.premise);
function latestDue(chip, tab, field) {
  let best = null;
  for (const e of evsFor(chip, tab)) { const due = parseDate(cell(e.t, e.row, field)); if (due && (!best || due > best)) best = due; }
  return best;
}
function vaccDue(d) { const a = d.nextVacc, b = latestDue(d.chip, 'Vaccinations', 'Next Due Date'); return a && b ? (a > b ? a : b) : (a || b); }

function breedInfo(d) {
  const matings = evsFor(d.chip, 'Mating Records', 'dam');
  const litters = evsFor(d.chip, 'Puppies Bred In-House', 'dam');
  const heats = evsFor(d.chip, 'Heat Cycles');
  const yr = TODAY.getUTCFullYear();
  const lm = matings[0];
  let expecting = null;
  if (lm && lm.date) {
    const since = -diffDays(lm.date);
    const failed = /^(no|n|false|unsuccessful|failed)$/i.test(cell(lm.t, lm.row, 'Successful').trim());
    const whelped = litters.some(l => l.date && l.date >= lm.date);
    if (!failed && !whelped && since >= 0 && since <= 70) expecting = { mated: lm.date, since, due: parseDate(cell(lm.t, lm.row, 'Expected Whelp Date')) || addDays(lm.date, 63), sire: cell(lm.t, lm.row, 'Sire #1 Name') || cell(lm.t, lm.row, 'Sire #1 Microchip'), sireChip: normChip(cell(lm.t, lm.row, 'Sire #1 Microchip')), ev: lm };
  }
  const lh = heats[0];
  const nextHeat = lh && lh.date ? (parseDate(cell(lh.t, lh.row, 'Est. Next Heat')) || addMonths(lh.date, 6)) : null;
  const sizes = litters.map(l => parseFloat(cell(l.t, l.row, 'No. of Puppies'))).filter(n => !isNaN(n));
  const yearAgo = addDays(TODAY, -365);
  return {
    matYr: matings.filter(m => m.date && m.date.getUTCFullYear() === yr).length, matLife: matings.length, litters: litters.length,
    litters12: litters.filter(l => l.date && l.date > yearAgo).length,
    csec: litters.filter(l => /c[\s-]?sec|caesar|cesar/i.test(cell(l.t, l.row, 'Delivery Method'))).length,
    lastWhelp: litters[0] && litters[0].date, avgSize: sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : null,
    expecting, lastHeat: lh && lh.date, nextHeat, ageM: ageMonths(d.dob), lastMating: lm || null,
  };
}
/** Checks a dam against the breeding rules in Settings. Each flag is {sev, text, key}. */
function breedingFlags(d, b) {
  const R = S.shared.breeding || {};
  b = b || breedInfo(d);
  const out = [];
  const has = v => v !== null && v !== undefined && v !== '';
  if (b.ageM == null) out.push({ sev: 'warn', key: 'dob', text: 'No date of birth, so age rules can’t be checked' });
  else if (has(R.minAgeMonths) && b.ageM < R.minAgeMonths) out.push({ sev: 'crit', key: 'young', text: `Under ${R.minAgeMonths} months old` });
  if (b.ageM != null && has(R.retireAgeYears) && b.ageM >= R.retireAgeYears * 12) out.push({ sev: 'crit', key: 'retire', text: `${Math.floor(b.ageM / 12)} years old (retirement age ${R.retireAgeYears})` });
  if (has(R.maxLitters) && b.litters >= R.maxLitters) out.push({ sev: 'crit', key: 'litters', text: `${plural(b.litters, 'litter')} in total (limit ${R.maxLitters})` });
  if (has(R.maxLittersPer12Months) && b.litters12 >= R.maxLittersPer12Months) out.push({ sev: 'crit', key: 'litters12', text: `${plural(b.litters12, 'litter')} in the last 12 months (limit ${R.maxLittersPer12Months})` });
  if (has(R.maxCsections) && b.csec >= R.maxCsections) out.push({ sev: 'crit', key: 'csec', text: `${plural(b.csec, 'C-section')} (limit ${R.maxCsections})` });
  if (has(R.minMonthsBetweenLitters) && b.lastWhelp) {
    const m = monthsBetween(b.lastWhelp, TODAY);
    if (m < R.minMonthsBetweenLitters) out.push({ sev: 'warn', key: 'gap', text: `${plural(m, 'month')} since her last litter (rest at least ${R.minMonthsBetweenLitters})` });
  }
  return out;
}
function rulesSummary() {
  const R = S.shared.breeding || {};
  const has = v => v !== null && v !== undefined && v !== '';
  const parts = [];
  if (has(R.minAgeMonths)) parts.push(`first mating from ${R.minAgeMonths} months`);
  if (has(R.maxLittersPer12Months)) parts.push(`at most ${plural(R.maxLittersPer12Months, 'litter')} in 12 months`);
  if (has(R.minMonthsBetweenLitters)) parts.push(`${R.minMonthsBetweenLitters} months’ rest between litters`);
  if (has(R.maxLitters)) parts.push(`${R.maxLitters} litters in total`);
  if (has(R.maxCsections)) parts.push(`${plural(R.maxCsections, 'C-section')} at most`);
  if (has(R.retireAgeYears)) parts.push(`retire at ${R.retireAgeYears} years`);
  return parts;
}

function dogIssues(d) {
  const out = [];
  const C = S.shared.checks || {};
  const soon = S.shared.dueSoonDays || 14;
  const push = (k, sev, text) => out.push({ k, sev, text });
  if (isActive(d)) {
    if (C.licence) {
      if (!d.pals) push('licence', 'crit', 'No licence number on record');
      else if (d.palsExp) { const n = diffDays(d.palsExp); if (n < 0) push('licence', 'crit', `Licence expired ${dmy(d.palsExp)}`); else if (n <= 30) push('licence', 'warn', `Licence expires ${dmy(d.palsExp)}`); }
    }
    if (C.healthcheck && onBreedingPremise(d)) {
      const last = (evsFor(d.chip, 'Annual Health Checks')[0] || {}).date;
      if (!last) push('healthcheck', 'crit', 'No annual health check on record');
      else { const n = diffDays(addMonths(last, 12)); if (n < 0) push('healthcheck', 'crit', `Annual check overdue (last ${dmy(last)})`); else if (n <= 30) push('healthcheck', 'warn', `Annual check due ${dmy(addMonths(last, 12))}`); }
    }
    const vd = vaccDue(d);
    if (vd) { const n = diffDays(vd); if (n < 0) push('vacc', 'crit', `Vaccination overdue since ${dmy(vd)}`); else if (n <= soon) push('vacc', 'warn', `Vaccination due ${dmy(vd)}`); }
    const pd = latestDue(d.chip, 'Parasite Treatments', 'Next Due Date');
    if (pd) { const n = diffDays(pd); if (n < 0) push('parasite', 'crit', `Parasite treatment overdue since ${dmy(pd)}`); else if (n <= soon) push('parasite', 'warn', `Parasite treatment due ${dmy(pd)}`); }
    if (isFemale(d) && onBreedingPremise(d)) {
      const flags = breedingFlags(d).filter(f => f.sev === 'crit' && f.key !== 'young');
      if (flags.length) push('breeding', 'warn', `Breeding limit reached: ${flags.map(f => f.text).join('; ')}`);
    }
    if (evsFor(d.chip, 'Deaths').length) push('deceased', 'warn', 'Recorded in Deaths but status is Active');
  }
  if (C.sterilise && isRetired(d) && !truthy(d.sterilised) && !/exempt/i.test(d.sterilised) && !evsFor(d.chip, 'Sterilisations').length) {
    if (/pending/i.test(d.sterilised)) push('sterilise', 'warn', 'Retired, sterilisation pending');
    else push('sterilise', 'crit', 'Retired and no sterilisation recorded');
  }
  if (!d.chip) {
    const days = ageDays(d.dob);
    if (days != null && days < 70) push('chip', 'warn', 'Not microchipped yet');
    else push('chip', 'crit', 'No microchip number');
  } else if (d.chip.length !== 15) push('chip', 'warn', `Microchip has ${d.chip.length} digits (ISO chips have 15)`);
  return out;
}
function chipInfo(chip) {
  if (!chip) return { text: 'No microchip recorded', bad: true };
  if (chip.length !== 15) return { text: `${chip.length} digits · ISO 11784 chips have 15`, bad: true };
  const p = chip.slice(0, 3), n = +p;
  if (n >= 900 && n <= 998) return { text: `Manufacturer code ${p}` };
  if (CC[p]) return { text: `Country code ${p} · ${CC[p]}` };
  return { text: `Code ${p} · not a country code this app recognises` };
}
const chipHTML = chip => !chip ? '<span class="muted">—</span>' : chip.length === 15 ? `<span class="chip"><span class="cc">${chip.slice(0, 3)}</span>${chip.slice(3)}</span>` : `<span class="chip">${esc(chip)}</span>`;
const dogName = d => d ? (d.name || `Unnamed ${titleCase(d.breed || 'dog')}`) : '';
const dogLabel = d => d ? `${dogName(d)}${d.id ? ' (' + d.id + ')' : ''}` : '';
const nameHTML = d => d.name ? esc(d.name) : `<span class="unnamed">Unnamed</span>`;
const sexWord = s => /^f/i.test(s) ? 'Female' : /^m/i.test(s) ? 'Male' : (s || '');
function statusPill(s) {
  if (!s) return '<span class="pill">No status</span>';
  const cls = /^active/i.test(s) ? 'acc' : /^adopted/i.test(s) ? 'ok' : /deceased|died/i.test(s) ? 'crit' : '';
  return `<span class="pill ${cls}">${esc(s)}</span>`;
}
function eventSummary(ev) {
  const parts = (ev.L.sum || []).map(h => { const v = cell(ev.t, ev.row, h); return v ? fmtVal(v, kindOf(h, ev.t.name)) : ''; }).filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return ev.row.v.filter(Boolean).slice(0, 3).join(' · ');
}
function farmInfo(field) {
  const t = S.db && S.db['Farm Info'];
  if (!t) return '';
  const row = t.rows.find(r => String(r.v[0]).trim().toLowerCase() === field.toLowerCase());
  return row ? row.v[1] || '' : '';
}
function firstChip(e) { const c = e.t.kinds.findIndex(k => k === 'chip'); return c >= 0 ? normChip(e.row.v[c]) : ''; }

function upcoming(days) {
  const out = [];
  const add = (date, kind, title, sub, extra) => { if (!date) return; const n = diffDays(date); if (n <= days && n >= -30) out.push({ date, days: n, kind, title, sub, ...extra }); };
  for (const d of DOGS.filter(isActive)) {
    const ref = { chip: d.chip, id: d.id };
    add(vaccDue(d), 'Vaccination', dogName(d), titleCase(d.breed), ref);
    add(latestDue(d.chip, 'Parasite Treatments', 'Next Due Date'), 'Parasite treatment', dogName(d), titleCase(d.breed), ref);
    if (S.shared.checks.licence && d.palsExp) add(d.palsExp, 'Licence expiry', dogName(d), d.pals, ref);
    if (isFemale(d)) {
      const b = breedInfo(d);
      if (b.expecting) add(b.expecting.due, 'Expected whelping', dogName(d), `Mated ${dmy(b.expecting.mated)}${b.expecting.sire ? ' to ' + b.expecting.sire : ''}`, ref);
      if (b.nextHeat && !b.expecting) add(b.nextHeat, 'Heat expected', dogName(d), 'Estimate from her last heat', ref);
    }
  }
  const st = S.db && S.db['Staff Training'];
  if (st) for (const r of st.rows) add(parseDate(cell(st, r, 'Refresher Due (3yr)')), 'Training refresher', cell(st, r, 'Staff Name'), cell(st, r, 'Course Name'), { tab: 'Staff Training' });
  return out.sort((a, b) => a.date - b.date);
}
/** Which copy of a repeated header this column is (0 for the first). */
function occOf(headers, c) { let k = 0; for (let i = 0; i < c; i++) if (headers[i] === headers[c]) k++; return k; }
/** A cell as the bridge should expect it. An unticked tick box is sent as blank, which every bridge version accepts. */
const expectVal = v => (v === 'FALSE' ? '' : v || '');
/** Every column of a row as it was read, so the bridge can refuse the save if anything in that row changed since. */
function rowExpect(t, row) {
  return t.headers.map((h, c) => ({ h, c })).filter(x => x.h && !t.formulaCols.has(x.c)).map(({ h, c }) => ({ h, k: occOf(t.headers, c), v: expectVal(row.v[c]), kind: t.kinds[c] }));
}
function newOpId() { try { return crypto.randomUUID(); } catch (e) { return Date.now().toString(36) + Math.random().toString(36).slice(2); } }
function hashOf(x) { const s = JSON.stringify(x); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
const AMBIGUOUS = ['network', 'timeout', 'bad_reply'];
function nextAnimalId() {
  let max = 0, prefix = 'A', width = 3;
  for (const d of DOGS) { const m = String(d.id).match(/^([A-Za-z]*)(\d+)$/); if (m && +m[2] > max) { max = +m[2]; prefix = m[1] || 'A'; width = m[2].length; } }
  return prefix + String(max + 1).padStart(width, '0');
}
