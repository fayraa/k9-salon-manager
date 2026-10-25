/* ───────── PDFs made on the phone ─────────
   The app describes each PDF as a small HTML page (the same page the desktop app prints). Here that
   page is laid out in a hidden frame, and every box, line of text and picture is copied into a PDF
   at the same place, split into A4 pages between rows and lines. Text uses the PDF's built-in
   Helvetica, stretched to the width the browser gave it; anything Helvetica can't show (Chinese
   names, for example) is drawn as a picture of the text instead. */
const PX = 0.75; // CSS pixels to PDF points
const A4W = 595.28, A4H = 841.89, MMPT = 72 / 25.4;
const PAGE = { left: 14 * MMPT, top: 16 * MMPT, width: A4W - 28 * MMPT, height: A4H - 32 * MMPT };
// Glyph widths (1/1000 em) of codes 32-255 in WinAnsi encoding, from Adobe's Helvetica metrics
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 0, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500];
const HELVB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 0, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 611, 611, 611, 611, 611, 611, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556];
const WIN_EXTRA = { 0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02C6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017D: 142, 0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155, 0x0153: 156, 0x017E: 158, 0x0178: 159 };
const NEAR = { 0x2212: '-', 0x2010: '-', 0x2011: '-', 0x2007: ' ', 0x2009: ' ', 0x200A: ' ', 0x202F: ' ', 0x2032: "'", 0x2033: '"' };
const FONTS = { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Helvetica-Oblique', F4: 'Helvetica-BoldOblique', F5: 'Courier', F6: 'Courier-Bold' };

/** Text in the fonts' WinAnsi encoding, or null if a character isn't in it. */
function winText(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (NEAR[c] !== undefined) out += NEAR[c];
    else if ((c >= 32 && c < 127) || (c >= 160 && c < 256)) out += String.fromCharCode(c);
    else if (WIN_EXTRA[c]) out += String.fromCharCode(WIN_EXTRA[c]);
    else return null;
  }
  return out;
}
function fontKey(cs) {
  const bold = (parseInt(cs.fontWeight, 10) || 400) >= 600, it = /italic|oblique/.test(cs.fontStyle);
  if (/mono|courier|consolas/i.test(cs.fontFamily)) return bold ? 'F6' : 'F5';
  return bold ? (it ? 'F4' : 'F2') : (it ? 'F3' : 'F1');
}
function textWidth(s, f) {
  if (f === 'F5' || f === 'F6') return s.length * 600;
  const W = f === 'F2' || f === 'F4' ? HELVB : HELV;
  let w = 0;
  for (let i = 0; i < s.length; i++) w += W[s.charCodeAt(i) - 32] || 0;
  return w;
}
/** A CSS colour as PDF fill values, blended onto white; null when it's transparent. */
function pdfRGB(s) {
  const m = String(s || '').match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
  const a = p.length > 3 ? p[3] : 1;
  if (!(a > 0.02)) return null;
  return p.slice(0, 3).map(v => 1 - a * (1 - v / 255));
}
const num = v => String(Math.round(v * 100) / 100);
const col = c => c.map(v => num(v)).join(' ');
function pdfStr(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 40 || c === 41 || c === 92) out += '\\' + s[i];
    else if (c < 32 || c > 126) out += '\\' + c.toString(8).padStart(3, '0');
    else out += s[i];
  }
  return out;
}
function utf16Hex(s) { let h = 'FEFF'; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i).toString(16).padStart(4, '0'); return `<${h.toUpperCase()}>`; }
/** A rectangle, with rounded corners when r is given (PDF coordinates, y going up). */
function rectPath(x, y, w, h, r) {
  if (!(r > 0.3)) return `${num(x)} ${num(y)} ${num(w)} ${num(h)} re`;
  r = Math.min(r, w / 2, h / 2);
  const k = r * 0.5523, p = (...v) => v.map(num).join(' ');
  return `${p(x + r, y)} m ${p(x + w - r, y)} l ${p(x + w - r + k, y, x + w, y + r - k, x + w, y + r)} c ${p(x + w, y + h - r)} l ${p(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)} c ${p(x + r, y + h)} l ${p(x + r - k, y + h, x, y + h - r + k, x, y + h - r)} c ${p(x, y + r)} l ${p(x, y + r - k, x + r - k, y, x + r, y)} c h`;
}
const latin1 = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
async function deflate(u8) {
  if (typeof CompressionStream === 'undefined') return null;
  try { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer()); } catch (e) { return null; }
}
function b64bytes(b64) { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
/** Width, height and colour channels of a JPEG, read from its header. */
function jpegInfo(u) {
  if (u[0] !== 0xFF || u[1] !== 0xD8) return null;
  let i = 2;
  while (i + 9 < u.length) {
    if (u[i] !== 0xFF) return null;
    const mk = u[i + 1];
    if (mk === 0xD8 || mk === 0x01 || (mk >= 0xD0 && mk <= 0xD7)) { i += 2; continue; }
    const len = (u[i + 2] << 8) | u[i + 3];
    if ((mk >= 0xC0 && mk <= 0xC3) || (mk >= 0xC5 && mk <= 0xC7) || (mk >= 0xC9 && mk <= 0xCB) || (mk >= 0xCD && mk <= 0xCF)) {
      return { h: (u[i + 5] << 8) | u[i + 6], w: (u[i + 7] << 8) | u[i + 8], n: u[i + 9] };
    }
    i += 2 + len;
  }
  return null;
}
function loadImage(src) {
  return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error('That picture couldn’t be read.')); im.src = src; });
}
/** Any picture as plain RGB JPEG bytes with its size (drawn onto white, so see-through parts stay light). */
async function asJpeg(src) {
  if (/^data:image\/jpeg;base64,/.test(src)) {
    const u = b64bytes(src.slice(src.indexOf(',') + 1));
    const info = jpegInfo(u);
    if (info && info.n === 3 && info.w && info.h) return { bytes: u, w: info.w, h: info.h };
  }
  const im = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(im, 0, 0);
  const url = c.toDataURL('image/jpeg', 0.9);
  return { bytes: b64bytes(url.slice(url.indexOf(',') + 1)), w: c.width, h: c.height };
}

/* the PDF file itself */
class PdfFile {
  constructor() { this.objs = []; }
  reserve() { this.objs.push(null); return this.objs.length; }
  put(id, body, stream) { this.objs[id - 1] = { body, stream }; return id; }
  add(body, stream) { return this.put(this.reserve(), body, stream); }
  async stream(dict, text) {
    const raw = latin1(text), z = await deflate(raw);
    return z ? this.add(`<<${dict} /Filter /FlateDecode`, z) : this.add(`<<${dict}`, raw);
  }
  image(jpg) { return this.add(`<</Type /XObject /Subtype /Image /Width ${jpg.w} /Height ${jpg.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, jpg.bytes); }
  bytes() {
    const parts = [];
    let len = 0;
    const offs = [];
    const push = u => { parts.push(u); len += u.length; };
    push(latin1('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    this.objs.forEach((o, i) => {
      offs.push(len);
      if (o.stream) { push(latin1(`${i + 1} 0 obj\n${o.body} /Length ${o.stream.length}>>\nstream\n`)); push(o.stream); push(latin1('\nendstream\nendobj\n')); }
      else push(latin1(`${i + 1} 0 obj\n${o.body}\nendobj\n`));
    });
    let x = `xref\n0 ${this.objs.length + 1}\n0000000000 65535 f \n`;
    offs.forEach(o => { x += `${String(o).padStart(10, '0')} 00000 n \n`; });
    x += `trailer\n<</Size ${this.objs.length + 1} /Root 1 0 R /Info 2 0 R>>\nstartxref\n${len}\n%%EOF\n`;
    push(latin1(x));
    const out = new Uint8Array(len);
    let p = 0;
    parts.forEach(u => { out.set(u, p); p += u.length; });
    return out;
  }
}
function pdfDate(d) { const p = n => String(n).padStart(2, '0'); return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`; }
/** Writes the catalogue, information and page tree around finished pages. */
async function finishPdf(pdf, title, pages) {
  pdf.put(1, '<</Type /Catalog /Pages 3 0 R>>');
  pdf.put(2, `<</Title ${utf16Hex(title || 'K-9 Salon')} /Producer (K-9 Salon Manager) /CreationDate (${pdfDate(new Date())})>>`);
  pdf.put(3, `<</Type /Pages /Kids [${pages.map(p => `${p} 0 R`).join(' ')}] /Count ${pages.length}>>`);
  return pdf.bytes();
}
function newPdf() { const pdf = new PdfFile(); pdf.reserve(); pdf.reserve(); pdf.reserve(); return pdf; }

/* laying the page out */
const UNITS = 'tr,h1,h2,h3,p,li,dt,dd,img,.tile,.sign>div,.top,.idrow';
function layoutFrame(html) {
  return new Promise((resolve, reject) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-same-origin');
    f.setAttribute('aria-hidden', 'true');
    f.setAttribute('title', 'PDF layout');
    f.tabIndex = -1;
    f.style.cssText = `position:fixed;left:-20000px;top:0;width:${Math.round(PAGE.width / PX)}px;height:600px;border:0;pointer-events:none`;
    const timer = setTimeout(() => { f.remove(); reject(new Error('The PDF took too long to lay out.')); }, 20000);
    f.addEventListener('load', async () => {
      clearTimeout(timer);
      const doc = f.contentDocument;
      if (!doc || !doc.body) { f.remove(); reject(new Error('The PDF couldn’t be laid out.')); return; }
      await Promise.all(Array.from(doc.images).map(i => (i.decode ? i.decode().catch(() => {}) : null)));
      resolve({ f, doc });
    }, { once: true });
    // lay it out with the PDF's own fonts, so line breaks match what is drawn
    f.srcdoc = String(html).replace('/*FONTS*/', 'body{font-family:Helvetica,Arial,sans-serif!important}.chip,.mono{font-family:Courier,"Courier New",monospace!important}');
    document.body.appendChild(f);
  });
}
function collect(doc) {
  const win = doc.defaultView, body = doc.body;
  const o = body.getBoundingClientRect();
  const ox = o.left, oy = o.top;
  const items = [], units = [];
  const probes = new Map();
  // where the baseline sits within a line of text, for each font
  const baseRatio = cs => {
    const key = `${cs.fontFamily}|${cs.fontWeight}|${cs.fontStyle}`;
    if (probes.has(key)) return probes.get(key);
    const s = doc.createElement('span');
    s.style.cssText = 'position:absolute;left:0;top:0;white-space:nowrap;font-size:100px;line-height:normal';
    s.style.fontFamily = cs.fontFamily; s.style.fontWeight = cs.fontWeight; s.style.fontStyle = cs.fontStyle;
    s.textContent = 'Hg';
    const i = doc.createElement('i');
    i.style.cssText = 'display:inline-block;width:1px;height:0;vertical-align:baseline';
    s.appendChild(i);
    body.appendChild(s);
    const r = doc.createRange(); r.selectNodeContents(s.firstChild);
    const tr = r.getBoundingClientRect(), base = i.getBoundingClientRect().bottom;
    s.remove();
    const v = tr.height ? (base - tr.top) / tr.height : 0.8;
    probes.set(key, v);
    return v;
  };
  const paintBox = (cs, b) => {
    const rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, b.w / 2, b.h / 2);
    const bg = pdfRGB(cs.backgroundColor);
    if (bg) items.push({ k: 'fill', x: b.x, y: b.y, w: b.w, h: b.h, rad, c: bg });
    const side = s => ({ w: parseFloat(cs[`border${s}Width`]) || 0, st: cs[`border${s}Style`], c: pdfRGB(cs[`border${s}Color`]) });
    const T = side('Top'), R = side('Right'), B = side('Bottom'), L = side('Left');
    const on = s => s.w > 0 && s.c && s.st !== 'none' && s.st !== 'hidden';
    if ([T, R, B, L].every(on) && [R, B, L].every(s => s.w === T.w && s.c.join() === T.c.join())) {
      items.push({ k: 'stroke', x: b.x + T.w / 2, y: b.y + T.w / 2, w: b.w - T.w, h: b.h - T.w, rad: Math.max(0, rad - T.w / 2), lw: T.w, c: T.c });
      return rad;
    }
    if (on(T)) items.push({ k: 'fill', x: b.x, y: b.y, w: b.w, h: T.w, c: T.c });
    if (on(B)) items.push({ k: 'fill', x: b.x, y: b.y + b.h - B.w, w: b.w, h: B.w, c: B.c });
    if (on(L)) items.push({ k: 'fill', x: b.x, y: b.y, w: L.w, h: b.h, c: L.c });
    if (on(R)) items.push({ k: 'fill', x: b.x + b.w - R.w, y: b.y, w: R.w, h: b.h, c: R.c });
    return rad;
  };
  const textItems = (node, cs) => {
    const s = node.data, range = doc.createRange();
    const lines = [];
    let cur = null;
    const add = (start, end, r) => {
      if (cur && Math.abs(r.top - cur.top) < 0.5 && r.left >= cur.right - 1) { cur.end = end; cur.right = r.right; cur.bottom = Math.max(cur.bottom, r.bottom); }
      else { cur = { start, end, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; lines.push(cur); }
    };
    const re = /\S+/g;
    let m;
    while ((m = re.exec(s))) {
      range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      const rects = Array.from(range.getClientRects()).filter(x => x.width > 0);
      if (rects.length <= 1) { if (rects[0]) add(m.index, m.index + m[0].length, rects[0]); continue; }
      // a long word broken over two lines: follow it letter by letter
      for (let i = m.index; i < m.index + m[0].length;) {
        const n = s.codePointAt(i) > 0xFFFF ? 2 : 1;
        range.setStart(node, i); range.setEnd(node, i + n);
        const r = range.getClientRects()[0];
        if (r && r.width > 0) add(i, i + n, r);
        i += n;
      }
    }
    const ratio = baseRatio(cs), size = parseFloat(cs.fontSize) || 14;
    const font = fontKey(cs), c = pdfRGB(cs.color) || [0, 0, 0];
    const cssFont = `${cs.fontStyle} ${cs.fontWeight} SIZEpx ${cs.fontFamily}`;
    for (const l of lines) {
      const it = { k: 'text', x: l.left - ox, y: l.top - oy, w: l.right - l.left, h: l.bottom - l.top, size, font, c, cssFont, text: s.slice(l.start, l.end).replace(/\s+/g, ' ') };
      it.base = it.y + ratio * it.h;
      items.push(it);
      units.push({ top: it.y, bottom: it.y + it.h });
    }
  };
  const walk = el => {
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none') return;
    const vis = cs.visibility === 'visible';
    const r = el.getBoundingClientRect();
    const b = { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height };
    let rad = 0;
    if (vis && b.w > 0 && b.h > 0 && el !== body) rad = paintBox(cs, b);
    if (b.h > 0 && el.matches(UNITS)) units.push({ top: b.y, bottom: b.y + b.h, keep: /^H[1-3]$/.test(el.tagName) });
    if (el.tagName === 'IMG') {
      if (!vis || !el.complete || !el.naturalWidth) return;
      const px = p => parseFloat(cs[p]) || 0;
      const l = px('borderLeftWidth') + px('paddingLeft'), t = px('borderTopWidth') + px('paddingTop');
      items.push({ k: 'img', src: el.currentSrc || el.src, nw: el.naturalWidth, nh: el.naturalHeight, x: b.x + l, y: b.y + t, w: b.w - l - px('borderRightWidth') - px('paddingRight'), h: b.h - t - px('borderBottomWidth') - px('paddingBottom'), fit: cs.objectFit, rad: Math.max(0, rad - px('borderLeftWidth')) });
      return;
    }
    for (const n of el.childNodes) {
      if (n.nodeType === 1) walk(n);
      else if (n.nodeType === 3 && vis && /\S/.test(n.data)) textItems(n, cs);
    }
  };
  walk(body);
  const height = Math.max(body.scrollHeight, ...items.map(i => i.y + i.h), 1);
  return { items, units, height };
}
/** Where each page starts: never inside a row or a line, and never just after a heading. */
function pageBreaks(units, total, H) {
  const breaks = [0];
  const sorted = units.slice().sort((a, b) => a.top - b.top);
  const straddles = y => sorted.some(u => u.top < y - 0.5 && u.bottom > y + 0.5);
  let start = 0;
  while (total - start > H + 0.5 && breaks.length < 500) {
    const limit = start + H;
    let br = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const t = sorted[i].top;
      if (t <= start + 1 || t > limit) continue;
      if (!straddles(t)) { br = t; break; }
    }
    if (br != null) {
      const head = sorted.find(u => u.keep && u.bottom <= br + 0.5 && u.bottom > br - 24 && u.top > start + 1 && !straddles(u.top));
      if (head) br = head.top;
    } else br = limit; // something taller than a page: cut it
    breaks.push(br);
    start = br;
  }
  return breaks;
}
/** A picture of some text, for characters the built-in fonts don't have. */
async function textPicture(pdf, it) {
  const sc = 4, pad = 2;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(it.w * sc) + pad * 2); c.height = Math.max(1, Math.ceil(it.h * sc));
  const g = c.getContext('2d');
  g.font = it.cssFont.replace('SIZE', String(it.size * sc));
  g.textBaseline = 'alphabetic';
  const ink = `rgb(${it.c.map(v => Math.round(v * 255)).join(',')})`;
  const draw = () => { g.fillStyle = ink; g.fillText(it.text, pad, (it.base - it.y) * sc, it.w * sc); };
  draw();
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const n = c.width * c.height, rgb = new Uint8Array(n * 3), a = new Uint8Array(n);
  for (let i = 0; i < n; i++) { rgb[i * 3] = px[i * 4]; rgb[i * 3 + 1] = px[i * 4 + 1]; rgb[i * 3 + 2] = px[i * 4 + 2]; a[i] = px[i * 4 + 3]; }
  const zr = await deflate(rgb), za = await deflate(a);
  let id;
  if (zr && za) {
    const mask = pdf.add(`<</Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`, za);
    id = pdf.add(`<</Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${mask} 0 R /Filter /FlateDecode`, zr);
  } else {
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.92);
    id = pdf.image({ bytes: b64bytes(url.slice(url.indexOf(',') + 1)), w: c.width, h: c.height });
  }
  return { id, w: c.width / sc, h: c.height / sc, dx: -pad / sc };
}
/** Turns the app's printable HTML into PDF bytes. */
async function htmlToPdf(html) {
  const { f, doc } = await layoutFrame(html);
  try {
    const title = (doc.title || 'K-9 Salon').trim();
    const { items, units, height } = collect(doc);
    const H = PAGE.height / PX;
    const breaks = pageBreaks(units, height, H);
    const pdf = newPdf();
    const fontIds = {};
    Object.keys(FONTS).forEach(k => { fontIds[k] = pdf.add(`<</Type /Font /Subtype /Type1 /BaseFont /${FONTS[k]} /Encoding /WinAnsiEncoding>>`); });
    const fontRes = Object.keys(fontIds).map(k => `/${k} ${fontIds[k]} 0 R`).join(' ');
    const imgs = new Map(); // src → object id and size
    const pics = new Map(); // text item → picture of it
    for (const it of items) {
      if (it.k === 'img' && !imgs.has(it.src)) { try { const j = await asJpeg(it.src); imgs.set(it.src, { id: pdf.image(j), name: `Im${imgs.size + 1}` }); } catch (e) { /* left out */ } }
      if (it.k === 'text') { it.win = winText(it.text); if (it.win === null) { const p = await textPicture(pdf, it); p.name = `Tx${pics.size + 1}`; pics.set(it, p); } }
    }
    const pages = [];
    for (let p = 0; p < breaks.length; p++) {
      const y0 = breaks[p], y1 = p + 1 < breaks.length ? breaks[p + 1] : Infinity;
      const X = x => PAGE.left + x * PX, Y = y => A4H - PAGE.top - (y - y0) * PX;
      let s = `q ${rectPath(PAGE.left, A4H - PAGE.top - PAGE.height, PAGE.width, PAGE.height)} W n\n`;
      const used = new Set();
      for (const it of items) {
        const top = it.y, bottom = it.y + it.h;
        if (it.k === 'fill' || it.k === 'stroke') {
          if (bottom <= y0 || top >= y1) continue;
          const path = rectPath(X(it.x), Y(bottom), it.w * PX, it.h * PX, it.rad * PX);
          s += it.k === 'fill' ? `${col(it.c)} rg ${path} f\n` : `${col(it.c)} RG ${num(it.lw * PX)} w ${path} S\n`;
          continue;
        }
        if (top < y0 - 0.5 || top >= y1) continue;
        if (it.k === 'img') {
          const im = imgs.get(it.src);
          if (!im || !(it.w > 0) || !(it.h > 0)) continue;
          used.add(im);
          let dw = it.w, dh = it.h;
          if (it.fit === 'cover' || it.fit === 'contain') { const sc = (it.fit === 'cover' ? Math.max : Math.min)(it.w / it.nw, it.h / it.nh); dw = it.nw * sc; dh = it.nh * sc; }
          const dx = it.x + (it.w - dw) / 2, dy = it.y + (it.h - dh) / 2;
          s += `q ${rectPath(X(it.x), Y(bottom), it.w * PX, it.h * PX, it.rad * PX)} W n ${num(dw * PX)} 0 0 ${num(dh * PX)} ${num(X(dx))} ${num(Y(dy + dh))} cm /${im.name} Do Q\n`;
        } else if (it.k === 'text') {
          const pic = pics.get(it);
          if (pic) { used.add(pic); s += `q ${num(pic.w * PX)} 0 0 ${num(pic.h * PX)} ${num(X(it.x + pic.dx))} ${num(Y(it.y + pic.h))} cm /${pic.name} Do Q\n`; continue; }
          const pt = it.size * PX, natural = textWidth(it.win, it.font) / 1000 * pt;
          const tz = natural > 0 ? Math.max(50, Math.min(200, (it.w * PX) / natural * 100)) : 100;
          s += `BT /${it.font} ${num(pt)} Tf ${num(tz)} Tz ${col(it.c)} rg 1 0 0 1 ${num(X(it.x))} ${num(Y(it.base))} Tm (${pdfStr(it.win)}) Tj ET\n`;
        }
      }
      s += 'Q\n';
      const content = await pdf.stream('', s);
      const xo = Array.from(used).map(u => `/${u.name} ${u.id} 0 R`).join(' ');
      pages.push(pdf.add(`<</Type /Page /Parent 3 0 R /MediaBox [0 0 ${A4W} ${A4H}] /Resources <</Font <<${fontRes}>>${xo ? ` /XObject <<${xo}>>` : ''} /ProcSet [/PDF /Text /ImageB /ImageC]>> /Contents ${content} 0 R>>`));
    }
    return await finishPdf(pdf, title, pages);
  } finally { f.remove(); }
}
/** Pictures of a record's pages as one PDF, a page each, turned to suit each picture. */
async function imagesToPdf(srcs) {
  const pdf = newPdf();
  const pages = [];
  const m = 8 * MMPT;
  for (const src of srcs) {
    const j = await asJpeg(src);
    const id = pdf.image(j);
    const land = j.w > j.h, W = land ? A4H : A4W, Hh = land ? A4W : A4H;
    const sc = Math.min((W - 2 * m) / j.w, (Hh - 2 * m) / j.h);
    const w = j.w * sc, h = j.h * sc;
    const content = await pdf.stream('', `q ${num(w)} 0 0 ${num(h)} ${num((W - w) / 2)} ${num((Hh - h) / 2)} cm /Im1 Do Q\n`);
    pages.push(pdf.add(`<</Type /Page /Parent 3 0 R /MediaBox [0 0 ${num(W)} ${num(Hh)}] /Resources <</XObject <</Im1 ${id} 0 R>> /ProcSet [/PDF /ImageC]>> /Contents ${content} 0 R>>`));
  }
  return finishPdf(pdf, 'Document', pages);
}
