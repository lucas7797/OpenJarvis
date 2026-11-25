# Star Billing — Android app (APK)

A full-screen Android app around the billing page. Bills stay on the phone inside the app.
Inside the app, **Save to phone** writes PDFs/JPEGs to `Downloads/Star Billing`, **Share**
opens the Android share sheet, **Print** uses Android printing, and the Back button closes
windows before leaving the app.

## Build

No Android SDK is needed. Requirements: JDK 11+, Python 3 with `cryptography`, and:

- `android.jar` — `com.google.android:android:4.1.1.4` from Maven Central (compile-time only)
- `dx.jar` — `com.jakewharton.android.repackaged:dalvik-dx:16.0.1` from Maven Central

```sh
python3 ../build_standalone.py          # refresh star-earth-movers-billing.html
python3 build_apk.py --deps DIR_WITH_JARS --out StarBilling.apk
```

`src/` is the app code; `stubs/` are compile-only stand-ins for newer Android APIs (not
packaged). `build_apk.py` writes the binary manifest and resource table, aligns the zip
and signs it with APK Signature Scheme v2 (Android 7.0+).

## Signing key — keep it

The first build creates `signing/key.pem` and `signing/cert.pem` (ignored by git).
Every update must be signed with the **same key**, otherwise Android refuses to install it
over the old app, and uninstalling first deletes the bills stored in the app. Keep a copy
of the key somewhere safe, and download a backup from the app before any reinstall.
To raise the version for an update, change `VERSION_CODE` / `VERSION_NAME` in `build_apk.py`.
