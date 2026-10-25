'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const jsQR = require('jsqr');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '66-qr.js'), 'utf8');
const { qrMatrix, qrSVG } = new Function('esc', `${src}; return { qrMatrix, qrSVG };`)(s => String(s));
const phone = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '65-phone.js'), 'utf8');
const { parseConnect, connectLink } = new Function(`${phone.slice(phone.indexOf('const BRIDGE_URL_RE'), phone.indexOf('const device ='))}; return { parseConnect, connectLink };`)();

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

test('QR codes of every size the app can make read back exactly', () => {
  for (let len = 1; len <= 600; len += len < 40 ? 1 : 9) {
    const text = Array.from({ length: len }, (_, i) => 'abcXYZ0123456789#&=-_/:.'[(i * 7 + len) % 24]).join('');
    assert.equal(decode(qrMatrix(text)), text, `length ${len}`);
  }
  assert.equal(decode(qrMatrix('Café ✓ 狗')), 'Café ✓ 狗', 'text that isn’t plain ASCII is sent as UTF-8');
  assert.throws(() => qrMatrix('x'.repeat(700)), /Too long/);
});

test('the phone code holds the phone link with the connection, and reads back into the same connection', () => {
  const url = 'https://script.google.com/macros/s/AKfycbTEST' + 'x'.repeat(60) + '/exec', key = 'f'.repeat(40);
  const link = connectLink('https://example.github.io/k9-salon-manager/', url, key);
  assert.equal(link, `https://example.github.io/k9-salon-manager/#s=AKfycbTEST${'x'.repeat(60)}&k=${key}`);
  assert.deepEqual(parseConnect(decode(qrMatrix(link))), { url, key });
  // Google Workspace web app addresses are kept whole
  const ws = 'https://script.google.com/a/macros/example.com/s/AKfycbWS123456/exec';
  assert.deepEqual(parseConnect(connectLink('https://x.test/', ws, key)), { url: ws, key });
  // anything else is refused
  assert.equal(parseConnect('https://x.test/#s=AKfycbTEST123&k=short'), null);
  assert.equal(parseConnect(`https://x.test/#u=${encodeURIComponent('https://evil.example/exec')}&k=${key}`), null);
  assert.equal(parseConnect('hello'), null);
  const svg = qrSVG(link, 'Code');
  assert.match(svg, /^<svg class="qr"[^>]*role="img" aria-label="Code"/);
  assert.match(svg, /fill="#fff"/, 'always dark on white, even in dark mode');
});
