/* ───────── QR codes (for connecting a phone) ───────── */
// Byte mode, error correction level M, versions 1 to 20 (up to 666 bytes): plenty for a link with a key in it.
// [error correction codewords per block, blocks in group 1, data codewords each, blocks in group 2, data codewords each]
const QR_M = [null, [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0], [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
  [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42], [28, 7, 45, 3, 46], [28, 10, 46, 1, 47], [26, 9, 43, 4, 44], [26, 3, 44, 11, 45], [26, 3, 41, 13, 42]];
const QR_ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90]];
function qrMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
function qrDivisor(n) {
  const r = new Array(n).fill(0); r[n - 1] = 1;
  let root = 1;
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { r[j] = qrMul(r[j], root); if (j + 1 < n) r[j] ^= r[j + 1]; } root = qrMul(root, 2); }
  return r;
}
function qrRemainder(data, div) {
  const r = new Array(div.length).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= qrMul(c, f); }); }
  return r;
}
/** The QR code for some text, as rows of true (dark) and false (light). */
function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let ver = 0, spec = null, dataCw = 0;
  for (let v = 1; v < QR_M.length; v++) {
    const s = QR_M[v], cw = s[1] * s[2] + s[3] * s[4];
    if (4 + (v < 10 ? 8 : 16) + bytes.length * 8 <= cw * 8) { ver = v; spec = s; dataCw = cw; break; }
  }
  if (!ver) throw new Error('Too long for a QR code');
  // the data bits
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0xEC; data.length < dataCw; p ^= 0xEC ^ 0x11) data.push(p);
  // split into blocks, add error correction, interleave
  const [ecn, b1, d1, b2, d2] = spec;
  const div = qrDivisor(ecn);
  const blocks = [];
  let k = 0;
  for (let i = 0; i < b1 + b2; i++) { const n = i < b1 ? d1 : d2; const d = data.slice(k, k + n); k += n; blocks.push({ d, e: qrRemainder(d, div) }); }
  const cws = [];
  for (let i = 0; i < Math.max(d1, d2); i++) blocks.forEach(b => { if (i < b.d.length) cws.push(b.d[i]); });
  for (let i = 0; i < ecn; i++) blocks.forEach(b => cws.push(b.e[i]));
  // function patterns
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = !!dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); } } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = QR_ALIGN[ver], last = al.length - 1;
  al.forEach((ay, i) => al.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = mask => {
    const d = (0 << 3) | mask; // level M is 00
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const f = ((d << 10) | r) ^ 0x5412, bit = i => (f >>> i) & 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, 1);
  };
  format(0);
  if (ver >= 7) {
    let r = ver;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    const v = (ver << 12) | r;
    for (let i = 0; i < 18; i++) { const dark = (v >>> i) & 1, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, dark); set(b, a, dark); }
  }
  // the codewords, in the zigzag order
  const all = [];
  cws.forEach(c => { for (let i = 7; i >= 0; i--) all.push((c >>> i) & 1); });
  let n = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && n < all.length) m[y][x] = all[n++] === 1;
    }
  }
  // pick the mask that is easiest to scan
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0, (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => (x * y) % 2 + (x * y) % 3 === 0, (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
  const apply = k2 => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k2](x, y)) m[y][x] = !m[y][x]; };
  let best = 0, bestScore = Infinity;
  for (let k2 = 0; k2 < 8; k2++) {
    apply(k2); format(k2);
    const s = qrPenalty(m);
    if (s < bestScore) { best = k2; bestScore = s; }
    apply(k2); // undo
  }
  apply(best); format(best);
  return m;
}
function qrPenalty(m) {
  const size = m.length;
  let score = 0, dark = 0;
  const line = get => {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && get(i) === get(i - 1)) run++;
      else { if (run >= 5) score += 3 + run - 5; run = 1; }
    }
    // finder-like 1:1:3:1:1 with four light modules on one side
    for (let i = 0; i + 11 <= size; i++) {
      const s = Array.from({ length: 11 }, (_, j) => (get(i + j) ? 1 : 0)).join('');
      if (s === '10111010000' || s === '00001011101') score += 40;
    }
  };
  for (let y = 0; y < size; y++) line(x => m[y][x]);
  for (let x = 0; x < size; x++) line(y => m[y][x]);
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3; }
  m.forEach(r => r.forEach(c => { if (c) dark++; }));
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}
/** A QR code as an SVG picture: always dark on white, with the quiet border scanners need. */
function qrSVG(text, label) {
  const m = qrMatrix(text), q = 4, n = m.length + q * 2;
  let d = '';
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg class="qr" viewBox="0 0 ${n} ${n}" role="img" aria-label="${esc(label || 'QR code')}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
