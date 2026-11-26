// Copies the web app (../civil-lab) into www/ for Capacitor.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', '..', 'civil-lab'), dst = path.join(__dirname, '..', 'www');
const skip = new Set(['sw.js', 'serve.ps1', 'start-mac-linux.sh', 'Start Civil Site Lab (Windows).bat', 'README.md']);
fs.rmSync(dst, { recursive: true, force: true });
(function copy(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const s = path.join(a, e.name), d = path.join(b, e.name);
    e.isDirectory() ? copy(s, d) : fs.copyFileSync(s, d);
  }
})(src, dst);
console.log('Copied web app to www/');
