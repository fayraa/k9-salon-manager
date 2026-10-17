'use strict';
// Writes dist/latest.json (read by the app's updater) and dist/release-notes.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const { version } = require(path.join(root, 'package.json'));
const file = `K-9-Salon-Manager-Setup-${version}.exe`;
const exe = path.join(root, 'dist', file);
const buf = fs.readFileSync(exe);
const changelog = fs.existsSync(path.join(root, 'CHANGELOG.md')) ? fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8') : '';
const m = changelog.match(new RegExp(`^## ${version.replace(/\./g, '\\.')}[^\\n]*\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm'));
const notes = m ? m[1].trim() : `Version ${version}`;
const info = { version, file, sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length, notes, date: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(path.join(root, 'dist', 'latest.json'), JSON.stringify(info, null, 2));
fs.writeFileSync(path.join(root, 'dist', 'release-notes.md'), `${notes}\n\n**Install:** download \`${file}\` below and run it. If Windows says it protected your PC, choose **More info → Run anyway**.\n\nSHA-256: \`${info.sha256}\`\n`);
console.log(JSON.stringify(info, null, 2));
