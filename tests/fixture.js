'use strict';
/** Made-up kennel records for tests. Microchips use the 999 test code; no real dogs. */
const DAY = 864e5;
const iso = d => new Date(d).toISOString().slice(0, 10);
const today = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
const ago = n => iso(today.getTime() - n * DAY);
const ahead = n => iso(today.getTime() + n * DAY);

const AB = ['Animal ID', 'Microchip No.', 'Name', 'Breed', 'Colour', 'Sex', 'Date of Birth', 'Age', 'Sterilised', 'Premise', 'Kennel No.', 'Status', 'Remarks', 'Vaccination Status', 'Next Vaccination Date', 'Source', 'Dam Microchip', 'Sire Microchip', 'PALS Licence No.', 'Licence Expiry'];
const NAMES = ['Biscuit', 'Mochi', 'Pepper', 'Toffee', 'Luna', 'Kiwi', 'Bean', 'Coco', 'Maple', 'Nori', 'Pudding', 'Sesame', 'Tofu', 'Waffle', 'Yuzu', 'Ziggy', 'Bun', 'Dumpling', 'Hazel', 'Juniper'];
const BREEDS = ['MALTIPOO', 'POMERANIAN', 'BICHON FRISE', 'MALTESE'];
const chip = i => '999000000' + String(100000 + i);
const dogs = NAMES.map((name, i) => {
  const female = i % 3 !== 2;
  const years = 1 + (i % 7);
  return [`T${String(i + 1).padStart(3, '0')}`, chip(i), name, BREEDS[i % 4], ['CREAM', 'WHITE', 'APRICOT'][i % 3], female ? 'F' : 'M', ago(years * 365 + i * 11), `${years}y`, i === 18 ? 'Yes' : '', i < 15 ? 'Test Kennel - Breeding' : 'Test Kennel', String(1 + (i % 4)), i === 18 || i === 19 ? 'Retired' : 'Active', '', '', '', 'Local breeder', '', '', i % 2 ? `LIC-${1000 + i}` : '', i % 2 ? ahead(200) : ''];
});
dogs.push(['T021', chip(20), '', 'MALTIPOO', 'CREAM', 'F', ago(40), '1 month', '', 'Test Kennel', '', 'Active', '', '', '', 'Bred in-house', chip(0), chip(2), '', '']);
dogs.push(['T022', chip(21), 'Olive', 'MALTESE', 'WHITE', 'F', ago(900), '2y', '', 'Test Kennel', '2', '', 'A very long remark', '', '', 'Local breeder', '', '', '', '']);
const rows = list => list.map((v, i) => ({ r: i + 2, v: v.slice() })); // copies, so one test's changes don't leak into the next

function readResponse({ version = 2, settings } = {}) {
  const tabs = {
    'All Breeds': { headers: AB, rows: rows(dogs), formulaCols: [7], lastRow: dogs.length + 1, maxRows: 1000 },
    'Vaccinations': { headers: ['Microchip No.', 'Dog Name', 'Date Given', 'Vaccine Type', 'Batch No.', 'Administering Vet', 'Vet Licence No.', 'Clinic', 'Next Due Date', 'Certificate No.', 'Signature Date'], rows: rows([[chip(0), 'Biscuit', ago(360), 'DHPPi', 'B-1', 'Dr Test', '', 'Test Clinic', ahead(5)], [chip(1), 'Mochi', ago(400), 'DHPPi', 'B-2', 'Dr Test', '', 'Test Clinic', ago(10)]]), formulaCols: [], lastRow: 3, maxRows: 1000 },
    'Parasite Treatments': { headers: ['Date', 'Microchip No.', 'Dog Name', 'Treatment Type', 'Product Name', 'Dosage', 'Administered By', 'Next Due Date'], rows: [], formulaCols: [], lastRow: 1, maxRows: 1000 },
    'Daily Health Monitoring': { headers: ['S/N', 'Date', 'Microchip No.', 'General', 'Skin/Eyes/Ears/Oral/Nasal', 'Limbs', 'Heart/Lungs', 'Fit for Breeding', 'Remarks', 'Vaccine Label'], rows: rows([[1, ago(2), chip(0), 'Normal']]), formulaCols: [], lastRow: 2, maxRows: 1000 },
    'Annual Health Checks': { headers: ['Microchip No.', 'Registered Name', 'Breed', 'DOB', 'Gender', 'Colour', 'Exam Date', 'General Condition', 'Fit for Breeding', 'Vet Name'], rows: rows([[chip(0), 'Biscuit', 'MALTIPOO', '', 'F', '', ago(100), 'Normal', 'Yes', 'Dr Test']]), formulaCols: [], lastRow: 2, maxRows: 1000 },
    'Mating Records': { headers: ['Date of Mating', 'Dam Microchip', 'Dam Name', 'Sire #1 Microchip', 'Sire #1 Name', 'Sire #2 Microchip', 'Sire #2 Name', 'Successful', 'Expected Whelp Date', 'Notes'], rows: rows([[ago(58), chip(3), 'Toffee', chip(2), 'Pepper', '', '', '', ahead(5)]]), formulaCols: [], lastRow: 2, maxRows: 1000 },
    'Heat Cycles': { headers: ['Microchip No.', 'Dog Name', 'Heat No.', 'Onset Date (Proestrus)', 'Est. Next Heat'], rows: rows([[chip(4), 'Luna', '2', ago(170), ahead(10)]]), formulaCols: [], lastRow: 2, maxRows: 1000 },
    'Puppies Bred In-House': { headers: ['Dam Microchip', 'Dam Breed', 'Dam DOB', 'Dam Source', 'Sire Microchip', 'Sire Breed', 'Litter DOB', 'Delivery Method', 'Litter No.', 'No. of Puppies', 'Puppy Microchips', 'Sex Breakdown', 'Colours', 'Date Out', 'Status', 'Notes'], rows: rows([[chip(0), 'MALTIPOO', '', '', chip(2), 'BICHON FRISE', ago(40), 'C-section', '1', '3', '', '1 M, 2 F', 'CREAM']]), formulaCols: [], lastRow: 2, maxRows: 1000 },
    'Breeding Dog Movement': { headers: ['Microchip No.', 'Gender', 'DOB', 'Breed', 'Date In', 'Source', 'Date Out', 'Reason', 'Kennel (From)', 'Kennel (To)', 'Remarks'], rows: [], formulaCols: [], lastRow: 1, maxRows: 1000 },
    'Deaths': { headers: ['Date of Death', 'Microchip No.', 'Dog Name', 'Breed', 'Age at Death', 'Cause of Death', 'Vet Confirmation', 'Certificate Issued'], rows: [], formulaCols: [], lastRow: 1, maxRows: 1000 },
    'Kennels': { headers: ['Kennel No.', 'Block', 'Capacity', 'Type', 'Notes'], rows: rows([['1', 'Block A', 3, 'Breeding'], ['2', 'Block A', 3, 'Breeding'], ['3', 'Block B', 2, 'Whelping'], ['4', 'Block B', 6, 'Breeding'], ['5', 'Isolation', 2, 'Isolation', 'Sick or injured dogs']]), formulaCols: [], lastRow: 6, maxRows: 1000 },
    'AVS Submissions': { headers: ['Month', 'Date Submitted', 'Submitted By', 'Email Reference', 'Attachments', 'Notes'], rows: [], formulaCols: [], lastRow: 1, maxRows: 1000 },
    'Farm Info': { headers: ['Field', 'Value'], rows: rows([['Farm Name', 'TEST KENNEL'], ['Licence Number', 'TEST-0001']]), formulaCols: [], lastRow: 3, maxRows: 1000 },
    'Staff Register': { headers: ['Staff Name', 'Role / Duties', 'Date Joined', 'Status'], rows: rows([['Sam Tester', 'Kennel hand', ago(900), 'Active']]), formulaCols: [], lastRow: 2, maxRows: 1000 },
  };
  if (version >= 2) tabs['App Change Log'] = { headers: ['Time', 'Person', 'Action', 'Tab', 'Row', 'Dog', 'Field', 'Before', 'After'], rows: rows([['2026-10-01 09:00', 'Sam Tester', 'Edited', 'All Breeds', 3, 'Mochi (T002)', 'Kennel No.', '1', '2']]), formulaCols: [], lastRow: 2, maxRows: 1000 };
  if (version >= 3) {
    // dropdowns like the ones in a real kennel sheet
    tabs['All Breeds'].rules = {
      5: { list: ['M', 'F'], strict: true },
      8: { list: ['Y', 'N', 'Pending', 'Exempted'], strict: true },
      10: { list: ['1', '2', '3', '4', '5', '6'], strict: true },
      11: { list: ['Active', 'Deceased', 'Retired', 'Sold', 'Adopted'], strict: true },
    };
  }
  const res = { ok: true, title: 'Test Kennel Records', url: 'https://docs.google.com/spreadsheets/d/TEST_SHEET_ID_1234567890abcdef/edit', version, tabs, photos: {} };
  if (version >= 2) { res.settings = settings || { checks: { licence: true, healthcheck: true, sterilise: true }, dueSoonDays: 14, breeding: { minAgeMonths: 12, maxLittersPer12Months: 1 }, reminders: { enabled: false, hour: 8, extra: '' } }; res.reminders = { installed: false }; }
  return res;
}
module.exports = { readResponse, chip, NAMES, ago, ahead, iso };
