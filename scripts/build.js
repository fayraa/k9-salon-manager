'use strict';
// Assembles renderer/ (what the Electron window loads) and web/ (the phone version) from src/.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = p => path.join(root, 'src', p);
const pkg = require('../package.json');
const VERSION = pkg.version;

function bundle(dir, header = '') {
  const modules = fs.readdirSync(src(dir)).filter(f => /^\d\d-.*\.js$/.test(f)).sort();
  return { count: modules.length, js: `(() => {\n'use strict';\n${header}${modules.map(f => `/* ===== ${f} ===== */\n${fs.readFileSync(src(`${dir}/${f}`), 'utf8')}`).join('\n')}\n})();\n` };
}
const FONTS_CSS = `@font-face{font-family:"Nunito Sans";font-style:normal;font-display:swap;font-weight:200 1000;src:url(fonts/nunito-sans-latin-wght-normal.woff2) format("woff2-variations"),url(fonts/nunito-sans-latin-wght-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-display:swap;font-weight:400;src:url(fonts/ibm-plex-mono-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-display:swap;font-weight:500;src:url(fonts/ibm-plex-mono-latin-500-normal.woff2) format("woff2")}
`;
const FONT_FILES = fs.readdirSync(path.join(root, 'renderer', 'fonts')).filter(f => f.endsWith('.woff2'));
// the newest changelog sections go into the app, for its "What's new" window
function changes() {
  const md = fs.existsSync(path.join(root, 'CHANGELOG.md')) ? fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8') : '';
  const out = [];
  md.split(/^## /m).slice(1).forEach(part => {
    const nl = part.indexOf('\n');
    const v = part.slice(0, nl < 0 ? undefined : nl).trim();
    if (/^\d+\.\d+\.\d+$/.test(v)) out.push({ v, body: nl < 0 ? '' : part.slice(nl + 1).trim() });
  });
  if (out.length && out[0].v !== VERSION) throw new Error(`CHANGELOG.md starts with ${out[0].v}, but package.json says ${VERSION}. Add a "## ${VERSION}" section.`);
  return out.slice(0, 8);
}
const app = bundle('js', `const CHANGES = ${JSON.stringify(changes())};\n`);
const css = fs.readFileSync(src('app.css'), 'utf8');
const body = fs.readFileSync(src('body.html'), 'utf8');

/* the desktop app */
{
  const out = p => path.join(root, 'renderer', p);
  fs.mkdirSync(out('fonts'), { recursive: true });
  fs.writeFileSync(out('app.js'), app.js);
  fs.writeFileSync(out('app.css'), css);
  fs.writeFileSync(out('fonts.css'), FONTS_CSS);
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  fs.writeFileSync(out('index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>K-9 Salon Manager</title>
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="app.css">
</head>
<body>
${body}<script src="app.js"></script>
</body>
</html>
`);
}

/* the phone version, published as a web page */
{
  const dir = path.join(root, 'web');
  const out = p => path.join(dir, p);
  fs.rmSync(dir, { recursive: true, force: true });
  ['fonts', 'icons', 'vendor'].forEach(d => fs.mkdirSync(out(d), { recursive: true }));
  const v = `?v=${encodeURIComponent(VERSION)}`;
  const shell = bundle('web', `const APP_VERSION = ${JSON.stringify(VERSION)};\n`);
  fs.writeFileSync(out('k9-web.js'), shell.js);
  fs.writeFileSync(out('app.js'), app.js);
  fs.writeFileSync(out('app.css'), css);
  fs.writeFileSync(out('fonts.css'), FONTS_CSS);
  FONT_FILES.forEach(f => fs.copyFileSync(path.join(root, 'renderer', 'fonts', f), out(`fonts/${f}`)));
  const icons = fs.readdirSync(src('web/icons')).filter(f => f.endsWith('.png'));
  icons.forEach(f => fs.copyFileSync(src(`web/icons/${f}`), out(`icons/${f}`)));
  // the QR code reader is only loaded when someone scans the connection code
  const jsqr = path.join(root, 'node_modules', 'jsqr');
  fs.copyFileSync(path.join(jsqr, 'dist', 'jsQR.js'), out('vendor/jsQR.js'));
  fs.copyFileSync(path.join(jsqr, 'LICENSE'), out('vendor/jsQR-LICENSE.txt'));
  fs.copyFileSync(path.join(root, 'apps-script', 'K9AppBridge.gs'), out('K9AppBridge.gs'));
  fs.writeFileSync(out('.nojekyll'), '');
  fs.writeFileSync(out('manifest.webmanifest'), JSON.stringify({
    id: './', name: 'K-9 Salon', short_name: 'K-9 Salon', description: pkg.description, lang: 'en-SG',
    start_url: './', scope: './', display: 'standalone', orientation: 'any',
    background_color: '#F4F5F0', theme_color: '#F4F5F0', categories: ['business', 'productivity'],
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2));
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://script.google.com https://script.googleusercontent.com; manifest-src 'self'; worker-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
  fs.writeFileSync(out('index.html'), `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<meta name="format-detection" content="telephone=no">
<title>K-9 Salon</title>
<meta name="description" content="${pkg.description}">
<meta name="theme-color" content="#F4F5F0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#171A16" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="K-9 Salon">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" href="icons/icon-192.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="stylesheet" href="fonts.css${v}">
<link rel="stylesheet" href="app.css${v}">
</head>
<body class="web">
${body}<script src="k9-web.js${v}"></script><script src="app.js${v}"></script>
</body>
</html>
`);
  // the service worker keeps these, and checks each against its fingerprint before using a kept copy
  const sha = f => require('crypto').createHash('sha256').update(fs.readFileSync(out(f))).digest('hex');
  const files = { './': sha('index.html'), [`k9-web.js${v}`]: sha('k9-web.js'), [`app.js${v}`]: sha('app.js'), [`app.css${v}`]: sha('app.css'), [`fonts.css${v}`]: sha('fonts.css'), 'manifest.webmanifest': sha('manifest.webmanifest') };
  FONT_FILES.forEach(f => { files[`fonts/${f}`] = sha(`fonts/${f}`); });
  icons.forEach(f => { files[`icons/${f}`] = sha(`icons/${f}`); });
  const later = { [`vendor/jsQR.js${v}`]: sha('vendor/jsQR.js') }; // kept once used
  fs.writeFileSync(out('sw.js'), fs.readFileSync(src('web/sw.js'), 'utf8').replace("'__VERSION__'", JSON.stringify(VERSION)).replace('__FILES__', JSON.stringify(files)).replace('__LATER__', JSON.stringify(later)));
  console.log(`phone version built from ${shell.count} modules into web/`);
}
console.log(`renderer built from ${app.count} modules (${(app.js.length / 1024).toFixed(0)} KB)`);
