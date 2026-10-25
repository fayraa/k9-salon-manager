'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const jsQR = require('jsqr');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '66-qr.js'), 'utf8');
const { qrMatrix, qrSVG } = new Function('esc', `${src}; return { qrMatrix, qrSVG };`)(s => String(s));
const phone = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '65-phone.js'), 'utf8');
const { parseConnect, connectCode, webAppTail } = new Function(`${phone.slice(phone.indexOf('const BRIDGE_URL_RE'), phone.indexOf('const device ='))}; return { parseConnect, connectCode, webAppTail };`)();

/** Reads a QR code back the way a phone would: from a picture with a white border. */
function decode(m, scale = 4) {
  const q = 4, n = (m.length + q * 2) * scale;
  const px = new Uint8ClampedArray(n * n * 4).fill(255);
  m.forEach((row, y) => row.forEach((dark, x) => {
    if (!dark) return;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) { const i = (((y + q) * scale + dy) * n + (x + q) * scale + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  }));
  const r = jsQR(px, n, n, { inversionAttempts: 'dontInvert' });
  return r && r.data;
}

// bytes each version holds at level M, in byte mode
const CAP = [0, 14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666];

test('QR codes of every size the app can make read back exactly, right up to each version’s limit', () => {
  const text = len => Array.from({ length: len }, (_, i) => 'abcXYZ0123456789#&=-_/:.'[(i * 7 + len) % 24]).join('');
  for (let v = 1; v <= 20; v++) {
    for (const len of [CAP[v] - 1, CAP[v], CAP[v] + 1]) {
      if (len < 1 || len > CAP[20]) continue;
      const m = qrMatrix(text(len));
      const want = CAP.findIndex((c, i) => i > 0 && len <= c);
      assert.equal(m.length, want * 4 + 17, `${len} bytes need version ${want}`);
      assert.equal(decode(m), text(len), `length ${len}`);
    }
  }
  assert.equal(decode(qrMatrix('Café ✓ 狗')), 'Café ✓ 狗', 'text that isn’t plain ASCII is sent as UTF-8');
  assert.throws(() => qrMatrix('x'.repeat(CAP[20] + 1)), /Too long/);
});

test('the connection code is plain text (so a camera app won’t open it as a link), and reads back into the same connection', () => {
  const url = 'https://script.google.com/macros/s/AKfycbTEST' + 'x'.repeat(60) + '/exec', key = 'f'.repeat(40);
  const c = connectCode(url, key);
  assert.equal(c, `K9SALON:1:s=AKfycbTEST${'x'.repeat(60)}&k=${key}`);
  assert.ok(!/^https?:/i.test(c));
  assert.deepEqual(parseConnect(decode(qrMatrix(c))), { url, key });
  assert.equal(webAppTail(url), '…xxxxxx');
  // Google Workspace web app addresses are kept whole
  const ws = 'https://script.google.com/a/macros/example.com/s/AKfycbWS123456/exec';
  assert.deepEqual(parseConnect(connectCode(ws, key)), { url: ws, key });
  // anything else is refused, links included
  assert.equal(parseConnect('K9SALON:1:s=AKfycbTEST123&k=short'), null);
  assert.equal(parseConnect(`K9SALON:1:u=${encodeURIComponent('https://evil.example/exec')}&k=${key}`), null);
  assert.equal(parseConnect(`https://x.test/#s=AKfycbTEST0123456789&k=${key}`), null);
  assert.equal(parseConnect('hello'), null);
  const svg = qrSVG(c, 'Code');
  assert.match(svg, /^<svg class="qr"[^>]*role="img" aria-label="Code"/);
  assert.match(svg, /fill="#fff"/, 'always dark on white, even in dark mode');
});
