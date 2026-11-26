# Civil Site Lab – Windows desktop software

This folder packages the web app in `../civil-lab` as installable desktop software, using Electron.

## Install (Windows 10/11)

1. Run `CivilSiteLab-Setup-1.0.0.exe`.
   - If SmartScreen shows "Windows protected your PC", click **More info → Run anyway**. This appears because the installer isn't code-signed.
2. Click **Next**, choose the folder (or keep the default), click **Install**, then **Finish**.
3. Start the app from the **Desktop** shortcut or from **Start → Civil Site Lab**.

The installer doesn't need administrator rights. It installs to `%LOCALAPPDATA%\Programs\Civil Site Lab`.

To uninstall, use **Settings → Apps → Civil Site Lab → Uninstall**, or the uninstall entry under **Start → Civil Site Lab**. Your saved reports are kept in `%APPDATA%\Civil Site Lab`.

## Build the installer

You need Node.js 20+ and NSIS (`makensis`).

```sh
cd civil-lab-desktop
npm install
npm run dist:win        # → dist/CivilSiteLab-Setup-<version>.exe
npm start               # run the app without installing
```

`dist:win` packages the app with electron-builder. It then builds the installer from `build/installer.nsi` with native `makensis`, so it also works on Linux without wine. The `.exe` icon and version details are set by `scripts/after-pack.js`.
