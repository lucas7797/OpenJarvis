#!/bin/sh
# Builds dist/CivilSiteLab-Setup-<version>.exe from dist/win-unpacked using native makensis (no wine).
set -e
cd "$(dirname "$0")/.."
VERSION=$(node -p "require('./package.json').version")
npx electron-builder --win dir --x64
makensis -V2 -DVERSION="$VERSION" build/installer.nsi
echo "Built dist/CivilSiteLab-Setup-$VERSION.exe"
