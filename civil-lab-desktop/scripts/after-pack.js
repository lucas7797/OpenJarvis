// Sets the Windows .exe icon and version info without wine (pure JS via resedit).
const fs = require('fs'), path = require('path'), ResEdit = require('resedit');
exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'win32') return;
  const pkg = ctx.packager.appInfo;
  const exe = path.join(ctx.appOutDir, `${pkg.productFilename}.exe`);
  const data = fs.readFileSync(exe);
  const pe = ResEdit.NtExecutable.from(data, { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(pe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, '..', 'build', 'icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map(i => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const v = pkg.version.split('.').map(Number);
  vi.setFileVersion(v[0], v[1], v[2], 0, 1033); vi.setProductVersion(v[0], v[1], v[2], 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    FileDescription: pkg.productName, ProductName: pkg.productName, CompanyName: 'Civil Site Lab',
    LegalCopyright: 'Civil Site Lab', OriginalFilename: `${pkg.productFilename}.exe`, InternalName: pkg.productName
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(pe);
  fs.writeFileSync(exe, Buffer.from(pe.generate()));
  console.log('  • icon and version info set on', path.basename(exe));
};
