'use strict';
// Syntax-checks the Apps Script bridge as plain JavaScript.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'K9AppBridge.gs'), 'utf8');
new vm.Script(src, { filename: 'K9AppBridge.gs' });
if (!src.includes("const SPREADSHEET_ID = '__SHEET_ID__';")) { console.error('K9AppBridge.gs must keep the __SHEET_ID__ placeholder so no sheet ID is published.'); process.exit(1); }
console.log('K9AppBridge.gs OK');
