'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '70-devices.js'), 'utf8');
const body = src.slice(src.indexOf('function parseChipLine'), src.indexOf('function feedSerial'));
const parseChipLine = new Function(`${body}; return parseChipLine;`)();

test('reads a plain 15-digit number', () => {
  assert.equal(parseChipLine('999000000012345'), '999000000012345');
  assert.equal(parseChipLine('Tag: 999000000012345 OK'), '999000000012345');
});
test('reads country and national ID written with a separator', () => {
  assert.equal(parseChipLine('999_000000001007'), '999000000001007');
  assert.equal(parseChipLine('FDX-B 999 000000012345'), '999000000012345');
});
test('ignores numbers that are too long or too short', () => {
  assert.equal(parseChipLine('1234567890123456'), '');
  assert.equal(parseChipLine('12345'), '');
  assert.equal(parseChipLine(''), '');
});
test('decodes a raw FDX-B frame sent least significant digit first', () => {
  // national ID 1007 = 0x3EF → 10 hex digits "00000003EF" sent reversed as "FE30000000"
  // country 999 = 0x3E7 → "03E7" sent reversed as "7E30"
  const frame = '\x02' + 'FE30000000' + '7E30' + '1' + '0' + '0000' + '000000' + '00' + 'FF' + '\x03';
  assert.equal(parseChipLine(frame), '999000000001007');
});
