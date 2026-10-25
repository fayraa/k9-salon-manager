/* ───────── microchip scans (keyboard-style and serial) ───────── */
function handleScan(chip) {
  chip = normChip(chip);
  if (chip.length < 9) return;
  S.lastScan = chip;
  const last = $('#scan-last');
  if (last) last.innerHTML = `Last scan: <span class="chip">${esc(chip)}</span>`;
  const a = document.activeElement;
  if (a && a.matches && a.matches('input.chip, input[data-kind="chip"]')) {
    a.value = chip;
    a.dispatchEvent(new Event('input', { bubbles: true }));
    a.dispatchEvent(new Event('change', { bubbles: true }));
    toast(`Scanned ${chip}`);
    return;
  }
  if (!S.db) return;
  const d = BYCHIP.get(chip);
  if (d) { while (OV.length && !topOverlay('dog')) { if (OV[OV.length - 1].job && OV[OV.length - 1].job.dirty) { toast(`Scanned ${dogName(d)}. Close the open form to see the profile.`); return; } closeTop(true); } openDog(chip); }
  else toast(`Scanned ${chip}. No dog has this microchip yet.`, true);
}
/* scanners that type like a keyboard: fast digits then Enter, outside text boxes */
const kbScan = { buf: '', last: 0 };
function keyboardScanner(e) {
  const t = performance.now();
  if (t - kbScan.last > 80) kbScan.buf = '';
  kbScan.last = t;
  if (/^\d$/.test(e.key)) { kbScan.buf += e.key; return; }
  if (e.key === 'Enter' && kbScan.buf.length >= 9) { const chip = kbScan.buf; kbScan.buf = ''; e.preventDefault(); handleScan(chip); }
}

/* serial (COM port) scanners */
const SERIAL = { port: null, reader: null, buf: '', timer: null, recent: { chip: '', at: 0 } };
/** Finds a microchip number in one line from a reader. Exported for tests. */
function parseChipLine(raw) {
  const s = String(raw || '');
  const text = s.replace(/[\x00-\x1f\x7f]/g, ' ');
  let m = text.match(/(?:^|\D)(\d{3})[\s_.\-]?(\d{12})(?!\d)/);
  if (m) return m[1] + m[2];
  // Raw FDX-B frames (e.g. WL-134 style modules): 10 hex digits of the national ID and 4 of the
  // country code, each sent least significant digit first.
  m = s.match(/([0-9A-Fa-f]{10})([0-9A-Fa-f]{4})[0-9A-Fa-f]{2,}/);
  if (m) {
    const rev = h => h.split('').reverse().join('');
    const id = parseInt(rev(m[1]), 16), cc = parseInt(rev(m[2]), 16);
    if (cc > 0 && cc <= 999 && id <= 999999999999) return String(cc).padStart(3, '0') + String(id).padStart(12, '0');
  }
  return '';
}
function feedSerial(text) {
  SERIAL.buf += text;
  clearTimeout(SERIAL.timer);
  const parts = SERIAL.buf.split(/[\r\n\x03]/);
  SERIAL.buf = parts.pop();
  if (SERIAL.buf.length > 600) SERIAL.buf = SERIAL.buf.slice(-200);
  parts.forEach(onSerialLine);
  if (SERIAL.buf) SERIAL.timer = setTimeout(() => { const b = SERIAL.buf; SERIAL.buf = ''; onSerialLine(b); }, 250);
}
function onSerialLine(line) {
  const chip = parseChipLine(line);
  if (!chip) return;
  const now = Date.now();
  if (chip === SERIAL.recent.chip && now - SERIAL.recent.at < 2500) return;
  SERIAL.recent = { chip, at: now };
  handleScan(chip);
}
function scannerChanged() { if (S.view === 'settings' && !OV.length) { const y = $('#main').scrollTop; renderView(); $('#main').scrollTop = y; } }
async function serialConnect(choose) {
  if (!('serial' in navigator)) { S.scanner = { state: 'error', msg: 'Serial ports aren’t available in this version of the app.' }; scannerChanged(); return; }
  try {
    S.scanner = { state: 'connecting' }; scannerChanged();
    let port = null;
    const saved = S.prefs.scanner && S.prefs.scanner.port;
    if (!choose) {
      const ports = await navigator.serial.getPorts();
      port = ports.find(p => { const i = p.getInfo(); return saved && i.usbVendorId === saved.v && i.usbProductId === saved.p; }) || null;
      if (!port) { S.scanner = { state: 'off' }; scannerChanged(); return; }
    } else port = await navigator.serial.requestPort();
    await port.open({ baudRate: +((S.prefs.scanner || {}).baud) || 115200 });
    SERIAL.port = port;
    const info = port.getInfo();
    await setPrefs({ scanner: Object.assign({}, S.prefs.scanner, { serial: true, port: { v: info.usbVendorId, p: info.usbProductId } }) });
    S.scanner = { state: 'on', name: info.usbVendorId ? `USB device ${info.usbVendorId.toString(16).padStart(4, '0')}:${(info.usbProductId || 0).toString(16).padStart(4, '0')}` : 'serial port' };
    scannerChanged();
    if (choose) toast('Scanner connected. Scan a microchip to try it.');
    readSerial(port);
  } catch (e) {
    const cancelled = e && (e.name === 'NotFoundError' || /no port selected/i.test(e.message || ''));
    S.scanner = cancelled ? { state: 'off' } : { state: 'error', msg: `Couldn’t open the scanner: ${(e && e.message) || e}. Check it’s plugged in and not open in another program.` };
    scannerChanged();
  }
}
async function readSerial(port) {
  const dec = new TextDecoder('latin1');
  while (port.readable && SERIAL.port === port) {
    const reader = port.readable.getReader();
    SERIAL.reader = reader;
    try {
      for (;;) { const { value, done } = await reader.read(); if (done) break; if (value) feedSerial(dec.decode(value, { stream: true })); }
    } catch (e) { /* the port went away */ } finally { try { reader.releaseLock(); } catch (e) { /* already released */ } }
    if (SERIAL.port !== port) return;
  }
  if (SERIAL.port === port) { SERIAL.port = null; S.scanner = { state: 'error', msg: 'The scanner was unplugged. Plug it back in and choose Connect.' }; scannerChanged(); }
}
async function serialDisconnect() {
  const port = SERIAL.port;
  SERIAL.port = null;
  try { if (SERIAL.reader) await SERIAL.reader.cancel(); } catch (e) { /* ignore */ }
  try { if (port) await port.close(); } catch (e) { /* ignore */ }
  await setPrefs({ scanner: Object.assign({}, S.prefs.scanner, { serial: false }) });
  S.scanner = { state: 'off' }; scannerChanged();
}
function chooseSerialPort(list) {
  if (!list.length) {
    window.k9.serialChoose('');
    modal('ports', { title: 'No scanner found', narrow: true, body: '<p>No COM ports are available. Plug the scanner in, wait a few seconds, then choose Connect again. If it still doesn’t appear, its USB driver may need installing.</p>', foot: '<span class="msg"></span><button class="btn primary" data-action="close-top">OK</button>' });
    return;
  }
  const o = modal('ports', {
    title: 'Choose your scanner', narrow: true, form: true,
    body: `<div class="radios col" role="radiogroup" aria-label="Ports">${list.map((p, i) => `<label class="radio"><input type="radio" name="port" value="${esc(p.portId)}" ${i === 0 ? 'checked' : ''}><span><b>${esc(p.displayName || p.portName || 'Serial port')}</b>${p.portName && p.displayName ? ` <span class="muted">${esc(p.portName)}</span>` : ''}</span></label>`).join('')}</div>`,
    foot: `<span class="msg"></span><button type="button" class="btn" data-action="close-top">Cancel</button><button type="submit" class="btn primary">Connect</button>`,
  });
  let chosen = false;
  o.onClose = () => { if (!chosen) window.k9.serialChoose(''); };
  $('form', o.el).addEventListener('submit', e => { e.preventDefault(); const v = ($('input[name=port]:checked', o.el) || {}).value || ''; chosen = true; window.k9.serialChoose(v); closeTop(true); });
}

/* ───────── updates ───────── */
function onUpdateState(u) {
  const prev = S.update.state;
  S.update = Object.assign({}, u);
  if (u.state === 'ready' && prev !== 'ready') toast(WEB ? `Version ${u.version} is ready. Reload to start using it.` : `Version ${u.version} has downloaded. Restart when you’re ready.`);
  if (u.state === 'error' && u.manual) toast(u.message || 'Couldn’t check for updates.', true);
  if (u.state === 'none' && u.manual) toast('You have the latest version.');
  if (!S.updateDismissed) renderBanners();
  if (S.view === 'settings' && !OV.length) { const a = document.activeElement; if (!a || !/INPUT|SELECT|TEXTAREA/.test(a.tagName)) { const y = $('#main').scrollTop; renderView(); $('#main').scrollTop = y; } }
}
