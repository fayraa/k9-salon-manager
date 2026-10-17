'use strict';
// Assembles renderer/ (what the Electron window loads) from src/.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const src = p => path.join(root, 'src', p);
const out = p => path.join(root, 'renderer', p);

const modules = fs.readdirSync(src('js')).filter(f => f.endsWith('.js')).sort();
const js = `(() => {\n'use strict';\n${modules.map(f => `/* ===== ${f} ===== */\n${fs.readFileSync(src('js/' + f), 'utf8')}`).join('\n')}\n})();\n`;
fs.mkdirSync(out('fonts'), { recursive: true });
fs.writeFileSync(out('app.js'), js);
fs.writeFileSync(out('app.css'), fs.readFileSync(src('app.css'), 'utf8'));
fs.writeFileSync(out('fonts.css'), `@font-face{font-family:"Nunito Sans";font-style:normal;font-display:swap;font-weight:200 1000;src:url(fonts/nunito-sans-latin-wght-normal.woff2) format("woff2-variations"),url(fonts/nunito-sans-latin-wght-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-display:swap;font-weight:400;src:url(fonts/ibm-plex-mono-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"IBM Plex Mono";font-style:normal;font-display:swap;font-weight:500;src:url(fonts/ibm-plex-mono-latin-500-normal.woff2) format("woff2")}
`);
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
${fs.readFileSync(src('body.html'), 'utf8')}<script src="app.js"></script>
</body>
</html>
`);
console.log(`renderer built from ${modules.length} modules (${(js.length / 1024).toFixed(0)} KB)`);
