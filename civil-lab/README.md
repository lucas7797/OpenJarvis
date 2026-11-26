# Civil Site Lab – On-site Test Report Generator

A single-page, offline web app for site quality-control labs. Open `index.html` in any browser (phone, tablet or PC). You don't need to install anything or create an account. Data stays on the device.

## Install

**Phone (Android or iPhone).** The app has to be opened from an `https://` web address once, then installed:
1. Put this folder online. Free options: drag the folder onto https://app.netlify.com/drop, or enable GitHub Pages for the repository.
2. Open that address on the phone.
   - Android (Chrome): tap **Install** in the app's top bar, or ⋮ menu → **Install app**.
   - iPhone (Safari): tap Share → **Add to Home Screen**.
3. It now opens from its own icon, full screen, and works offline.

To get a real Android `.apk` (for example, for sideloading), enter the same web address at https://www.pwabuilder.com and choose Android.

**Windows / Mac / Linux computer.**
- Windows: double-click `Start Civil Site Lab (Windows).bat`.
- Mac / Linux: run `./start-mac-linux.sh`.

The app opens in your browser at `http://localhost:8765`. Click **Install** (or the install icon in Chrome/Edge's address bar) to get a desktop app with its own window and Start-menu/Dock icon. You can also just open `index.html` directly; it works, but can't be installed that way.

## Tests (each in its own tab)

| Group | Tests |
|---|---|
| Sieve analysis | GSB (Grading I–VI), WMM, 40 / 20 / 12.5 / 10 / 6 mm aggregate, fine aggregate (zones I–IV, with automatic zone detection), BM, DBM, BC, custom |
| Soil & earthwork | Proctor compaction (MDD/OMC with curve and ZAV line), sand replacement FDD, core cutter FDD, Atterberg limits (LL/PL/PI), CBR |
| Concrete | Cube compressive strength, concrete core test (L/D correction, IS 456 cl. 17.4), concrete mix design (IS 10262:2019) |
| Pavement mix design | WMM, GSB, BM and BC aggregate blending / JMF with auto-optimised proportions |
| Bituminous | Marshall stability/flow/volumetrics, binder content by extraction and core density |
| Materials | Cement (consistency, setting time, fineness, soundness, sp. gr., strength), water (IS 456 cl. 5.4), reinforcement steel (IS 1786), brick water absorption / strength / efflorescence, brick dimension test, aggregate physical tests (AIV, ACV, LAA, FI/EI, SG/WA, silt) |

## Features

- **Editable:** every field, table row, spec limit, report title and acceptance criterion can be edited. You can add or remove rows.
- **Automatic calculations:** results update as you type, with PASS/FAIL marks, an overall verdict and charts.
- **PDF download:** A4 report with header, project details, results, charts, signatures and page numbers.
- **Sharing:** uses the phone's native share sheet (WhatsApp, email, Drive and so on). Where a browser can't attach files, it offers download plus WhatsApp, email, Telegram and copy-summary instead.
- **Document scanner:** capture with the camera or upload images, then apply auto-enhance, black & white or grayscale, rotate and reorder pages. You can export the pages as a PDF or attach them as an annexure to every report.
- **Signatures:** set up any number of signatories. Each one can draw a signature or upload an image, and signs or un-signs each report individually. The signing date is recorded.
- **Records:** save reports, then reopen, duplicate or delete them. You can export the register as CSV and back up or restore all data as JSON.
- **Print** support, plus light and dark themes.

> Specification limits are pre-filled from IS / MoRTH references for convenience. Always verify them against the contract specification and edit them where needed.

`vendor/` contains html2canvas 1.4.1 and jsPDF 2.5.1 (MIT), so PDFs work offline.
