#!/bin/sh
# Builds build/CivilSiteLab-Setup-<version>.exe (needs NSIS: apt install nsis / brew install makensis / choco install nsis)
set -e
cd "$(dirname "$0")"
mkdir -p build
[ -d build/app ] && find build/app -mindepth 1 -delete
mkdir -p build/app
cp -R ../../civil-lab/. build/app/
for f in sw.js serve.ps1 start-mac-linux.sh "Start Civil Site Lab (Windows).bat" README.md; do
  [ -e "build/app/$f" ] && find "build/app/$f" -delete
done
cat > build/README.txt <<'EOF'
Civil Site Lab
==============
Start it from the Start menu or the desktop icon. It opens in its own window
(using Microsoft Edge or Google Chrome) and works completely offline.

Your reports, records and signatures are saved on this computer in
%LOCALAPPDATA%\CivilSiteLab. Use Records -> Export backup to copy them to
another computer or phone.

To remove: Settings -> Apps -> Civil Site Lab -> Uninstall.
EOF
makensis -V2 CivilSiteLab.nsi
ls -la build/*.exe
