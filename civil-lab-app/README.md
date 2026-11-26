# Civil Site Lab – Android app

This folder wraps the web app in `../civil-lab` as a native Android app using [Capacitor](https://capacitorjs.com).

- **App name:** Civil Site Lab
- **Package:** `com.civilsitelab.app`
- **Works offline.** All app files are inside the APK.
- **PDF** saves to `Documents/CivilSiteLab/`. If that fails, it opens the share sheet instead.
- **Share** opens Android's share sheet (WhatsApp, Gmail, Drive and others) with the PDF attached.
- **Camera / document scanner** use the phone camera. Android asks for camera permission the first time.

## Get the APK – option 1: automatic build on GitHub (no tools needed)

1. Push this repository to GitHub.
2. Open the **Actions** tab → **Civil Site Lab – Android APK**. It runs automatically on every push to `civil-lab/` or `civil-lab-app/`, or you can press **Run workflow**.
3. When it finishes, download **CivilSiteLab-apk** from the run page. It's a zip containing `CivilSiteLab.apk`.
4. Copy `CivilSiteLab.apk` to your phone and open it. Allow **Install unknown apps** when Android asks.

## Get the APK – option 2: build on your computer

Requirements: [Node.js 20+](https://nodejs.org) and [Android Studio](https://developer.android.com/studio). Android Studio includes the Android SDK and Java.

```sh
cd civil-lab-app
npm install
npm run sync          # copies ../civil-lab into the app
npm run open          # opens the project in Android Studio
```

In Android Studio, use **Build → Build App Bundle(s) / APK(s) → Build APK(s)**. Or plug in your phone with USB debugging on and press ▶ Run.

From a terminal with the SDK installed, `npm run build:debug` produces `android/app/build/outputs/apk/debug/app-debug.apk`.

## Updating the app

Edit the web app in `../civil-lab`, then run `npm run sync` and rebuild. The Android project picks up the changes.

## Publishing on Google Play

Play needs a signed release build:
1. In Android Studio, use **Build → Generate Signed App Bundle / APK**.
2. Create a keystore and keep it safe. Every future update must be signed with the same key.
3. Upload the `.aab` file to the Play Console.
