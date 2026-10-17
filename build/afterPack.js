// Sets the K-9 Salon icon and version details on the Windows .exe (works on any OS, no Wine needed).
const fs = require('fs');
const path = require('path');
const ResEdit = require('resedit');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const pe = ResEdit.NtExecutable.from(fs.readFileSync(exe), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(pe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const target = groups[0] || { id: 1, lang: 1033 };
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, target.id, target.lang, ico.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  if (vi) {
    const langs = vi.getAllLanguagesForStringValues();
    const lang = langs[0] || { lang: 1033, codepage: 1200 };
    const v = context.packager.appInfo.version.split('.').map(Number);
    vi.setStringValues(lang, {
      ProductName: 'K-9 Salon Manager',
      FileDescription: 'K-9 Salon Manager',
      CompanyName: 'K-9 Salon',
      InternalName: 'K-9 Salon Manager',
      OriginalFilename: 'K-9 Salon Manager.exe',
      ProductVersion: context.packager.appInfo.version,
      FileVersion: context.packager.appInfo.version,
      LegalCopyright: '',
    });
    vi.setFileVersion(v[0] || 1, v[1] || 0, v[2] || 0, 0, lang.lang);
    vi.setProductVersion(v[0] || 1, v[1] || 0, v[2] || 0, 0, lang.lang);
    vi.outputToResourceEntries(res.entries);
  }
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • set icon and version info on', path.basename(exe));
};
