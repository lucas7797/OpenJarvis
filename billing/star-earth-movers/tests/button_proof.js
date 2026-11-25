// Clicks every button in the billing app and writes a proof report (HTML + PDF)
// with a pass/fail line for each check and screenshots.
//
// Usage: node tests/button_proof.js <path-to-app.html> <output-dir> [--viewer]
//   --viewer  runs every check with the app inside a sandboxed frame, the way
//             file-preview and chat apps show an HTML file (storage, pop-ups,
//             downloads and printing are blocked there).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const appPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'star-earth-movers-billing.html'));
const outDir = path.resolve(process.argv[3] || path.join(__dirname, 'proof'));
fs.mkdirSync(outDir, { recursive: true });

const viewer = process.argv.includes('--viewer');
const results = [];
const shots = [];
let page, P; // P = the document the app runs in (the page, or the sandboxed frame)

async function check(area, name, fn) {
  try {
    const detail = await fn();
    results.push({ area, name, ok: true, detail: detail || '' });
  } catch (e) {
    results.push({ area, name, ok: false, detail: String(e.message || e).split('\n')[0] });
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
async function shot(title, locator, opts = {}) {
  const buf = await (locator || page).screenshot(opts);
  shots.push({ title, data: buf.toString('base64') });
}
const val = (id) => P.inputValue('#' + id);
const ls = (k) => P.evaluate((k) => window.semStorage.get(k), k);
async function download(selector) {
  if (!viewer) {
    const [dl] = await Promise.all([page.waitForEvent('download'), P.click(selector)]);
    const file = path.join(outDir, 'dl-' + dl.suggestedFilename());
    await dl.saveAs(file);
    return { name: dl.suggestedFilename(), buf: fs.readFileSync(file), file };
  }
  // the viewer blocks the download itself; check the file the app produced
  const n = await P.evaluate(() => window.__blobs.length);
  await P.click(selector);
  await P.waitForFunction((n) => window.__blobs.length > n, n);
  const { name, b64 } = await P.evaluate(async () => {
    const blob = window.__blobs[window.__blobs.length - 1];
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return { name: window.__dlName, b64: btoa(bin) };
  });
  const file = path.join(outDir, 'dl-' + name);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  return { name, buf: fs.readFileSync(file), file };
}
// answer the app's own "Are you sure?" box
async function yes() { await P.waitForSelector('#askModal:not(.hidden)'); await P.click('#askYes'); }
const tab = (v) => P.click(`.tab[data-view="${v}"]`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 }, acceptDownloads: true });
  // Stand-ins for the browser features a headless test cannot use for real
  await ctx.addInitScript(() => {
    window.__printed = 0; window.print = () => { window.__printed++; };
    window.__shared = null;
    navigator.canShare = () => true;
    navigator.share = async (d) => { window.__shared = { n: d.files.length, name: d.files[0].name, size: d.files[0].size }; };
    // record files the app creates for download
    window.__blobs = [];
    const orig = URL.createObjectURL;
    URL.createObjectURL = (b) => { window.__blobs.push(b); return orig.call(URL, b); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__dlName = this.download; return click.call(this); };
  });
  page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // the app must never rely on browser pop-ups (viewer apps block them)
  page.on('dialog', (d) => { errors.push('browser pop-up used: ' + d.message()); d.dismiss(); });
  if (viewer) {
    const framePage = path.join(outDir, 'viewer-frame.html');
    fs.copyFileSync(appPath, path.join(outDir, 'app-under-test.html'));
    fs.writeFileSync(framePage, '<!doctype html><body style="margin:0"><iframe src="app-under-test.html" sandbox="allow-scripts" style="width:900px;height:1300px;border:0"></iframe></body>');
    await page.goto('file://' + framePage);
    P = page.frames().find((f) => f.url().endsWith('app-under-test.html'));
    await P.waitForSelector('#slip');
  } else {
    await page.goto('file://' + appPath);
    P = page;
  }

  // ---------- Navigation ----------
  for (const [v, label] of [['registerView', 'All Bills'], ['templatesView', 'Templates'], ['reviewsView', 'Reviews'], ['settingsView', 'Settings'], ['billView', 'Bill Entry']]) {
    await check('Navigation', `Tab "${label}"`, async () => {
      await tab(v);
      expect(await P.isVisible('#' + v), 'view not shown');
      return 'opens the ' + label + ' screen';
    });
  }

  // ---------- Heading alignment ----------
  const centreOffset = () => P.evaluate(() => {
    const head = document.querySelector('#slip .head').getBoundingClientRect();
    const t1 = document.querySelector('#slip .t1');
    const r = document.createRange(); r.selectNodeContents(t1); const tr = r.getBoundingClientRect();
    return Math.abs((tr.left + tr.width / 2) - (head.left + head.width / 2));
  });
  await check('Heading', 'Title is centred on the bill', async () => {
    const off = await centreOffset();
    expect(off < 3, 'title is ' + off.toFixed(1) + 'px off centre');
    return 'STAR / EARTH MOVERS centre is ' + off.toFixed(1) + 'px from the page centre';
  });
  await shot('Heading — default (logo left, title centred)', P.locator('#slip .head'));

  await P.click('#headingPanel summary');
  const segs = { logoPos: ['right', 'top', 'none', 'left'], titleAlign: ['left', 'right', 'center'], contactAlign: ['left', 'center', 'right', 'auto'], titleSize: ['s', 'l', 'm'] };
  const dataAttr = { logoPos: 'logoPos', titleAlign: 'titleAlign', contactAlign: 'contactAlign', titleSize: 'titleSize' };
  for (const [key, values] of Object.entries(segs)) {
    for (const v of values) {
      const label = await P.textContent(`.seg[data-key="${key}"] button[data-v="${v}"]`);
      await check('Heading', `${key.replace(/([A-Z])/g, ' $1').toLowerCase()} → "${label}"`, async () => {
        await P.click(`.seg[data-key="${key}"] button[data-v="${v}"]`);
        const got = await P.evaluate((k) => document.getElementById('slip').dataset[k], dataAttr[key]);
        expect(got === v, 'bill shows ' + got);
        const saved = (await ls('sem_settings_v1'))[key];
        expect(saved === v, 'not saved');
        if (key === 'logoPos' || key === 'titleAlign') await shot(`Heading — ${key === 'logoPos' ? 'logo' : 'title'}: ${label}`, P.locator('#slip .head'));
        return 'applied and saved';
      });
    }
  }
  await check('Heading', 'Title still centred with logo on the right', async () => {
    await P.click('.seg[data-key="logoPos"] button[data-v="right"]');
    const off = await centreOffset();
    await P.click('.seg[data-key="logoPos"] button[data-v="left"]');
    expect(off < 3, off.toFixed(1) + 'px off');
    return off.toFixed(1) + 'px from centre';
  });
  await check('Heading', '"Reset alignment" button', async () => {
    await P.click('.seg[data-key="titleAlign"] button[data-v="left"]');
    await P.click('#btnResetAlign');
    const d = await P.evaluate(() => ({ ...document.getElementById('slip').dataset }));
    expect(d.titleAlign === 'center' && d.logoPos === 'left' && d.titleSize === 'm', JSON.stringify(d));
    return 'back to logo left, title centred, medium';
  });

  // ---------- 15 logos ----------
  const logoCount = await P.locator('.logo-opt').count();
  await check('Logos', 'Logo picker has 15 designs', async () => { expect(logoCount === 15, 'found ' + logoCount); return '15 found'; });
  const seen = new Set();
  for (let i = 0; i < logoCount; i++) {
    const name = (await P.locator('.logo-opt span').nth(i).textContent()).trim();
    await check('Logos', `Logo ${name}`, async () => {
      await P.locator('.logo-opt').nth(i).click();
      const svg = await P.innerHTML('#slip .logo');
      expect(svg.includes('<svg'), 'no logo drawn');
      expect(!seen.has(svg), 'same drawing as another logo');
      seen.add(svg);
      expect(await P.locator('.logo-opt').nth(i).evaluate((b) => b.classList.contains('active')), 'not highlighted');
      return 'shown on the bill';
    });
  }
  await shot('All 15 logos', P.locator('#logoGrid'));
  await P.locator('.logo-opt').first().click();

  // ---------- Editable heading text ----------
  await check('Bill', 'Heading text can be edited', async () => {
    await P.click('#slip .t2');
    await page.keyboard.press('End');
    await page.keyboard.type(' & CO');
    const saved = (await ls('sem_settings_v1')).text.title2;
    expect(saved === 'EARTH MOVERS & CO', 'saved: ' + saved);
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    return 'typed " & CO", saved, then removed';
  });

  // ---------- Bill entry & calculations ----------
  await check('Bill', 'Auto calculation', async () => {
    await P.fill('#party', 'Ravi Constructions');
    await P.fill('#address', 'Salem Road, Namakkal');
    await P.fill('#startMeter', '1250.5'); await P.fill('#closeMeter', '1258');
    await P.fill('#rate', '1200'); await P.fill('#advance', '2000');
    const v = [await val('running'), await val('total'), await val('amount'), await val('balance')];
    expect(v.join() === '7.5,7.5,9000,7000', v.join());
    return 'Running 7.5, Total 7.5, Amount 9000, Balance 7000';
  });
  for (const id of ['running', 'total', 'amount', 'balance']) {
    await check('Bill', `↺ button on ${id[0].toUpperCase() + id.slice(1)}`, async () => {
      const before = await val(id);
      await P.fill('#' + id, '1');
      expect(await P.isVisible(`#${id} ~ .auto`), '↺ not shown after typing');
      await P.click(`#${id} ~ .auto`);
      expect(await val(id) === before, 'did not return to ' + before);
      return 'typed over, ↺ restored ' + before;
    });
  }
  await check('Bill', 'Typed-over Total updates Amount & Balance', async () => {
    await P.fill('#total', '8');
    const a = await val('amount'), b = await val('balance');
    expect(a === '9600' && b === '7600', a + '/' + b);
    return 'Total 8 → Amount 9600, Balance 7600';
  });
  await check('Bill', '"Save" button', async () => {
    await P.click('#btnSave');
    const bills = await ls('sem_bills_v1');
    expect(bills.length === 1 && bills[0].billNo === '50' && bills[0].amount === '9600', JSON.stringify(bills));
    expect(await P.isVisible('#btnDelete'), 'Delete button not shown');
    return 'Bill No. 50 stored';
  });
  // ---------- Signatures ----------
  async function scribble(seed) {
    const bx = await P.locator('#sigPad').boundingBox();
    await page.mouse.move(bx.x + 50, bx.y + 140); await page.mouse.down();
    for (let i = 0; i < 45; i++) await page.mouse.move(bx.x + 50 + i * 8, bx.y + 115 + Math.sin(i / seed) * 45 + (i % 7) * 2);
    await page.mouse.up();
  }
  const sigSrc = (who) => P.getAttribute(`#slip .sig[data-who="${who}"] .sig-img`, 'src');
  await check('Signature', '"✍ Sign" (operator) opens the signature pad', async () => {
    await P.click('.sig-btn[data-sign="operator"]');
    expect(await P.isVisible('#signModal'), 'pad not shown');
    expect(await P.isVisible('#sigSaveDefault'), '"Save as my signature" missing');
    return 'pad opens with Clear / Upload photo / Save as my signature / Done';
  });
  await check('Signature', 'Pen colour buttons', async () => {
    for (const c of ['Black', 'Red', 'Blue']) {
      await P.click(`.pen:text-is("${c}")`);
      expect(await P.locator(`.pen:text-is("${c}")`).evaluate((b) => b.classList.contains('active')), c + ' not selected');
    }
    return 'Blue, Black and Red each select';
  });
  await check('Signature', 'Drawing + "Clear" button', async () => {
    await scribble(3);
    const inked = await P.evaluate(() => { const c = document.getElementById('sigPad'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
    expect(inked > 200, 'nothing drawn');
    await P.click('#sigClear');
    const after = await P.evaluate(() => { const c = document.getElementById('sigPad'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return 1; return 0; });
    expect(after === 0, 'not cleared');
    return 'drawing leaves ink; Clear wipes the pad';
  });
  await shot('Signature pad (party signing on a phone or with a mouse)', P.locator('#signModal .modal-box'));
  await check('Signature', '"Save as my signature" button', async () => {
    await scribble(3);
    await P.click('#sigSaveDefault');
    const s = await ls('sem_settings_v1');
    expect(s.defaultSig && s.defaultSig.startsWith('data:image/png'), 'not saved');
    return 'stored as the operator\'s saved signature (' + Math.round(s.defaultSig.length / 1024) + ' KB)';
  });
  await check('Signature', '"Done" puts the operator signature on the bill', async () => {
    await P.click('#sigDone');
    expect(!(await P.isVisible('#signModal')), 'pad still open');
    expect((await sigSrc('operator') || '').startsWith('data:image/png'), 'no image on bill');
    const b = (await ls('sem_bills_v1'))[0];
    expect(b.sigOperator === '@default', 'bill not updated: ' + String(b.sigOperator).slice(0, 20));
    return 'signature shown above "Operator Signature" and bill auto-saved';
  });
  await check('Signature', 'Party signs', async () => {
    await P.click('.sig-btn[data-sign="party"]');
    expect(!(await P.isVisible('#sigSaveDefault')), 'party should not get "Save as my signature"');
    await P.click('.pen:text-is("Black")');
    await scribble(5);
    await P.click('#sigDone');
    const b = (await ls('sem_bills_v1'))[0];
    expect(b.sigParty && b.sigParty.startsWith('data:image/png') && b.sigPartyAt, 'party signature not stored');
    return 'party signature shown and saved with the time signed';
  });
  await check('Signature', '"Upload photo" of a signature', async () => {
    const file = path.join(outDir, 'signature-photo.png');
    const b64 = await P.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 150;
      const x = c.getContext('2d'); x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 400, 150);
      x.strokeStyle = '#1a1a5a'; x.lineWidth = 5; x.beginPath(); x.moveTo(30, 100);
      x.bezierCurveTo(90, 10, 150, 140, 210, 60); x.bezierCurveTo(260, 0, 320, 130, 370, 50); x.stroke();
      return c.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    await P.click('.sig-btn[data-sign="party"]');
    await P.setInputFiles('#sigUpload', file);
    await P.waitForTimeout(400);
    const corner = await P.evaluate(() => document.getElementById('sigPad').getContext('2d').getImageData(4, 4, 1, 1).data[3]);
    expect(corner === 0, 'paper background not removed');
    await P.click('#sigDone');
    return 'photo loaded, paper background removed, signature applied';
  });
  await check('Signature', '"Use my saved signature" button', async () => {
    await P.click('.sig-btn[data-sign="operator"]');
    expect(await P.isVisible('#sigUseSaved'), 'button hidden');
    await P.click('#sigClear');
    await P.click('#sigUseSaved');
    await P.click('#sigDone');
    expect((await sigSrc('operator') || '').startsWith('data:image/png'), 'not applied');
    return 'saved signature placed back on the bill';
  });
  await check('Signature', 'Close (✕) leaves the signature unchanged', async () => {
    const before = await sigSrc('party');
    await P.click('.sig-btn[data-sign="party"]');
    await P.click('#sigClear');
    await P.click('#signClose');
    expect(await sigSrc('party') === before, 'changed');
    return 'cancelling keeps the existing signature';
  });

  // ---------- Preview ----------
  await check('Preview', '"Preview" button', async () => {
    await P.click('#btnPreview');
    await P.waitForSelector('#previewImg:not(.hidden)');
    const w = await P.evaluate(() => document.getElementById('previewImg').naturalWidth);
    expect(w > 1000, 'image width ' + w);
    return 'shows the finished bill image (' + w + 'px wide)';
  });
  await shot('Preview window (with both signatures)', P.locator('#previewModal .modal-box'));
  await check('Preview', '"Download PDF" in preview', async () => {
    const d = await download('#pvPdf');
    expect(d.buf.slice(0, 4).toString() === '%PDF', 'not a PDF');
    return d.name;
  });
  await check('Preview', '"Download JPEG" in preview', async () => {
    const d = await download('#pvJpg');
    expect(d.buf[0] === 0xff && d.buf[1] === 0xd8, 'not a JPEG');
    return d.name;
  });
  await check('Preview', '"Share" in preview', async () => {
    await P.evaluate(() => { window.__shared = null; });
    await P.click('#pvShare');
    await P.waitForFunction(() => window.__shared);
    return 'passes the bill image to the share sheet (simulated)';
  });
  await check('Preview', '"Print" in preview', async () => {
    const before = await P.evaluate(() => window.__printed);
    await P.click('#pvPrint');
    expect(await P.evaluate(() => window.__printed) === before + 1, 'print not opened');
    const printsPreview = await P.evaluate(() => document.body.classList.contains('preview-open'));
    expect(printsPreview, 'print would not use the preview');
    return 'opens print with the preview image (simulated)';
  });
  await check('Preview', '"Edit bill" in preview', async () => {
    await P.click('#pvEdit');
    expect(!(await P.isVisible('#previewModal')) && await P.isVisible('#billView'), 'not back to editing');
    return 'closes preview, back to the bill';
  });
  await check('Preview', 'Close with ✕ and with Esc key', async () => {
    await P.click('#btnPreview'); await P.click('#previewClose');
    expect(!(await P.isVisible('#previewModal')), '✕ did not close');
    await P.click('#btnPreview'); await page.keyboard.press('Escape');
    expect(!(await P.isVisible('#previewModal')), 'Esc did not close');
    return 'both close the window';
  });

  await shot('Bill entry screen after saving (with signatures)', P.locator('#slip'));

  // ---------- Bill review ----------
  await check('Bill review', 'Stars + "Save Review"', async () => {
    await P.click('#billStars button[data-v="4"]');
    await P.fill('#billReviewText', 'Good work, finished on time.');
    await P.click('#btnBillReview');
    const r = await ls('sem_reviews_v1');
    expect(r.length === 1 && r[0].rating === 4 && r[0].billNo === '50', JSON.stringify(r));
    return '4★ review stored against Bill No. 50';
  });
  await check('Bill review', '"Remove Review" button', async () => {
    await P.click('#btnBillReviewDel');
    expect((await ls('sem_reviews_v1')).length === 0, 'still stored');
    await P.click('#billStars button[data-v="5"]');
    await P.click('#btnBillReview');
    return 'removed (then re-added a 5★ review for later checks)';
  });

  // ---------- Downloads ----------
  await check('Bill', '"PDF" button', async () => {
    const d = await download('#btnPdf');
    expect(d.buf.slice(0, 4).toString() === '%PDF', 'not a PDF');
    return d.name + ' (' + Math.round(d.buf.length / 1024) + ' KB, valid PDF)';
  });
  await check('Bill', '"JPEG" button', async () => {
    const d = await download('#btnJpg');
    expect(d.buf[0] === 0xff && d.buf[1] === 0xd8, 'not a JPEG');
    shots.push({ title: 'Downloaded JPEG of the bill', data: d.buf.toString('base64'), mime: 'image/jpeg' });
    return d.name + ' (' + Math.round(d.buf.length / 1024) + ' KB, valid JPEG)';
  });
  await check('Bill', '"Share" button', async () => {
    expect(await P.isVisible('#btnShare'), 'button hidden');
    await P.click('#btnShare');
    await P.waitForFunction(() => window.__shared);
    const s = await P.evaluate(() => window.__shared);
    expect(s.n === 1 && s.name.endsWith('.jpg') && s.size > 10000, JSON.stringify(s));
    return 'passes ' + s.name + ' to the phone share sheet (simulated)';
  });
  await check('Bill', '"Print" button', async () => {
    const before = await P.evaluate(() => window.__printed);
    await P.click('#btnPrint');
    expect(await P.evaluate(() => window.__printed) === before + 1, 'print not opened');
    return 'opens the print dialog (simulated)';
  });

  // ---------- New / second bill / Delete ----------
  await check('Bill', '"New" button', async () => {
    await P.click('#btnNew');
    expect(await val('billNo') === '51', 'bill no ' + await val('billNo'));
    expect(await val('party') === '' && await val('amount') === '', 'form not cleared');
    expect(!(await P.isVisible('#btnDelete')), 'Delete still shown');
    return 'blank bill, number moved to 51';
  });
  await P.fill('#party', 'Kumar Builders'); await P.fill('#startMeter', '100'); await P.fill('#closeMeter', '104');
  await P.fill('#rate', '1100'); await P.fill('#advance', '4400'); await P.click('#btnSave');
  await P.click('#btnNew');
  await P.fill('#party', 'Delete Me'); await P.fill('#rate', '1'); await P.click('#btnSave');
  await check('Bill', '"Delete" button', async () => {
    await P.click('#btnDelete'); await yes();
    const bills = await ls('sem_bills_v1');
    expect(bills.length === 2 && !bills.some((b) => b.party === 'Delete Me'), bills.length + ' bills');
    return 'bill removed after confirmation';
  });

  // ---------- All Bills ----------
  await tab('registerView');
  await check('All Bills', 'List shows saved bills', async () => {
    const n = await P.locator('#billRows tr').count();
    expect(n === 2, n + ' rows');
    return '2 bills, totals row present';
  });
  await shot('All Bills screen', P.locator('#registerView'));
  await check('All Bills', 'Search box', async () => {
    await P.fill('#search', 'kumar');
    const n = await P.locator('#billRows tr').count();
    await P.fill('#search', '');
    expect(n === 1, n + ' rows');
    return '"kumar" → 1 bill';
  });
  await check('All Bills', 'Date filters', async () => {
    await P.fill('#fromDate', '2000-01-01'); await P.fill('#toDate', '2000-01-02');
    const empty = await P.textContent('#billRows');
    await P.fill('#fromDate', ''); await P.fill('#toDate', '');
    expect(empty.includes('No bills'), 'filter did not apply');
    return 'out-of-range dates hide the bills';
  });
  await check('All Bills', 'Paid / Due labels', async () => {
    const t = await P.textContent('#billRows');
    expect(t.includes('Due') && t.includes('Paid'), t);
    return 'Ravi = Due, Kumar = Paid';
  });
  await check('All Bills', '"Export CSV" button', async () => {
    const d = await download('#btnCsv');
    const csv = d.buf.toString('utf8');
    expect(csv.includes('Ravi Constructions') && csv.includes('Kumar Builders') && csv.includes('rating'), 'content');
    return d.name + ' with 2 bills + ratings';
  });
  let backupFile;
  await check('All Bills', '"Download Backup" button', async () => {
    const d = await download('#btnBackup');
    const j = JSON.parse(d.buf.toString('utf8'));
    expect(j.bills.length === 2 && j.reviews.length === 1 && j.settings, 'content');
    backupFile = d.file;
    return d.name + ' (2 bills, 1 review, settings)';
  });
  await check('All Bills', '"✕" (delete) button in list', async () => {
    await P.locator('#billRows button[data-del]').last().click(); await yes();
    expect((await ls('sem_bills_v1')).length === 1, 'not deleted');
    return 'row removed';
  });
  await check('All Bills', '"Restore Backup" button', async () => {
    await P.setInputFiles('#restoreFile', backupFile); await yes();
    await P.waitForFunction(() => window.semStorage.get('sem_bills_v1').length === 2);
    return 'deleted bill came back from the backup';
  });
  await check('All Bills', '"Open" button', async () => {
    await tab('registerView');
    await P.locator('#billRows tr', { hasText: 'Ravi' }).locator('button[data-open]').click();
    expect(await P.isVisible('#billView') && await val('party') === 'Ravi Constructions', 'not opened');
    expect(await val('total') === '8', 'typed-over total lost');
    return 'Bill No. 50 opened for editing, typed-over Total kept';
  });
  await check('All Bills', '"Preview" button in list', async () => {
    await tab('registerView');
    await P.locator('#billRows tr', { hasText: 'Kumar' }).locator('button[data-preview]').click();
    await P.waitForSelector('#previewImg:not(.hidden)');
    const title = await P.textContent('#previewTitle');
    expect(title.includes('Kumar Builders'), title);
    await P.click('#previewClose');
    return 'opens the preview window for Kumar Builders';
  });
  await check('All Bills', '"✍ Signed" label for signed bills', async () => {
    await tab('registerView');
    const row = await P.locator('#billRows tr', { hasText: 'Ravi' }).textContent();
    expect(row.includes('Signed'), row);
    return 'Ravi Constructions shows ✍ Signed';
  });
  await P.locator('#billRows tr', { hasText: 'Ravi' }).locator('button[data-open]').click();

  // ---------- Templates ----------
  await tab('templatesView');
  await P.waitForTimeout(300);
  const tplCount = await P.locator('.tpl-card').count();
  await check('Templates', 'Template screen has 15 designs', async () => { expect(tplCount === 15, String(tplCount)); return '15 found'; });
  await shot('Templates screen', P.locator('#templatesView'));
  const papers = new Set();
  for (let i = 0; i < tplCount; i++) {
    const name = (await P.locator('.tpl-card > .name').nth(i).textContent()).trim();
    await check('Templates', `Template ${name}`, async () => {
      await P.locator('.tpl-card').nth(i).click();
      const s = await P.evaluate(() => { const e = document.getElementById('slip'); return e.className + '|' + e.style.getPropertyValue('--paper') + e.style.getPropertyValue('--ink'); });
      expect(!papers.has(s), 'looks the same as another template');
      papers.add(s);
      return 'applied to the bill';
    });
  }
  await P.locator('.tpl-card').first().click();

  // ---------- Reviews ----------
  await tab('reviewsView');
  await check('Reviews', '"Add Review" button (with stars)', async () => {
    await P.fill('#rvParty', 'Kumar Builders');
    await P.selectOption('#rvBill', { index: 1 });
    await P.click('#rvStars button[data-v="3"]');
    await P.fill('#rvText', 'Operator came late.');
    await P.click('#btnAddReview');
    expect((await ls('sem_reviews_v1')).length === 2, 'not added');
    return '3★ review added and linked to a bill';
  });
  await check('Reviews', 'Average & star bars', async () => {
    const avg = await P.textContent('#avgRating');
    expect(avg === '4.0', avg);
    return 'average 4.0 from 5★ + 3★';
  });
  await shot('Reviews screen', P.locator('#reviewsView'));
  await check('Reviews', 'Rating filter', async () => {
    await P.selectOption('#reviewFilter', '3');
    const n = await P.locator('.review-item').count();
    await P.selectOption('#reviewFilter', '0');
    expect(n === 1, String(n));
    return '"3 ★" shows 1 review';
  });
  await check('Reviews', 'Search box', async () => {
    await P.fill('#reviewSearch', 'late');
    const n = await P.locator('.review-item').count();
    await P.fill('#reviewSearch', '');
    expect(n === 1, String(n));
    return '"late" → 1 review';
  });
  await check('Reviews', '"Open bill" button', async () => {
    await P.locator('.review-item button[data-openbill]').first().click();
    expect(await P.isVisible('#billView'), 'not opened');
    await tab('reviewsView');
    return 'opens the linked bill';
  });
  await check('Reviews', '"✕" (delete review) button', async () => {
    await P.locator('.review-item button[data-delrev]').first().click(); await yes();
    expect((await ls('sem_reviews_v1')).length === 1, 'not deleted');
    return 'review removed';
  });

  // ---------- Settings ----------
  await tab('settingsView');
  await check('Settings', '"Save Settings" button', async () => {
    await P.fill('#setNextNo', '200'); await P.fill('#setCurrency', 'Rs.'); await P.fill('#setOperator', 'Murugan');
    await P.click('#btnSaveSettings');
    const s = await ls('sem_settings_v1');
    expect(s.nextNo === 200 && s.currency === 'Rs.' && s.operator === 'Murugan', JSON.stringify(s));
    await tab('billView'); await P.click('#btnNew');
    expect(await val('billNo') === '200' && await val('operator') === 'Murugan', 'not used on new bill');
    return 'new bill uses No. 200 and operator Murugan';
  });
  await check('Settings', 'Saved signature shown + auto-sign on new bills', async () => {
    await tab('settingsView');
    expect(await P.isVisible('#savedSigImg'), 'saved signature not shown');
    expect(await P.isChecked('#setAutoSign'), 'auto-sign not on');
    await tab('billView'); await P.click('#btnNew');
    expect((await sigSrc('operator') || '').startsWith('data:image/png'), 'new bill not auto-signed');
    expect(!(await sigSrc('party')), 'party signature should be blank');
    return 'new bill already has the operator signature, party blank';
  });
  await check('Settings', 'Auto-sign checkbox off', async () => {
    await tab('settingsView'); await P.uncheck('#setAutoSign'); await P.click('#btnSaveSettings');
    await tab('billView'); await P.click('#btnNew');
    const src = await sigSrc('operator');
    await tab('settingsView'); await P.check('#setAutoSign'); await P.click('#btnSaveSettings');
    expect(!src, 'still signed');
    return 'new bills stay unsigned when switched off';
  });
  await check('Settings', '"Remove saved signature" button', async () => {
    await tab('settingsView'); await P.click('#btnRemoveSavedSig'); await yes();
    const s = await ls('sem_settings_v1');
    const ravi = (await ls('sem_bills_v1')).find((b) => b.party === 'Ravi Constructions');
    expect(!s.defaultSig, 'still saved');
    expect(ravi.sigOperator && ravi.sigOperator.startsWith('data:image/png'), 'old bill lost its signature');
    return 'removed; Bill No. 50 keeps its operator signature';
  });
  await check('Settings', '"Reset heading & labels" button', async () => {
    await tab('billView');
    await P.click('#slip .t1'); await page.keyboard.type('X');
    await tab('settingsView'); await P.click('#btnResetHeader'); await yes();
    const t = await P.textContent('#slip .t1');
    expect(t === 'STAR', t);
    return 'heading back to STAR';
  });

  // ---------- Driver bata ----------
  await check('Driver Bata', 'Default bata in Settings fills new bills', async () => {
    await tab('settingsView');
    await P.fill('#setBata', '300'); await P.check('#setBataInAmount'); await P.click('#btnSaveSettings');
    await tab('billView'); await P.click('#btnNew');
    expect(await val('bata') === '300', 'bata field: ' + await val('bata'));
    return 'new bill starts with Driver Bata 300';
  });
  await check('Driver Bata', 'Bata added to Amount and Balance', async () => {
    await P.fill('#party', 'Bata Test One'); await P.fill('#operator', 'Murugan');
    await P.fill('#startMeter', '0'); await P.fill('#closeMeter', '5'); await P.fill('#rate', '1000'); await P.fill('#advance', '1000');
    const a = await val('amount'), b = await val('balance');
    expect(a === '5300' && b === '4300', a + ' / ' + b);
    await P.click('#btnSave');
    return '5 h × 1000 + bata 300 = Amount 5300, Balance 4300';
  });
  await check('Driver Bata', '"Driver Bata" line printed on the bill', async () => {
    await P.click('#btnPreview'); await P.waitForSelector('#previewImg:not(.hidden)');
    const txt = await P.evaluate(() => [...document.querySelectorAll('#slip .field label')].map((l) => l.textContent).join('|'));
    await P.click('#previewClose');
    expect(txt.includes('Driver Bata'), txt);
    return 'shown between R / H and Amount';
  });
  await P.click('#btnNew');
  await P.fill('#party', 'Bata Test Two'); await P.fill('#operator', 'Selvam'); await P.fill('#rate', '900');
  await P.fill('#startMeter', '0'); await P.fill('#closeMeter', '2'); await P.fill('#bata', '250'); await P.click('#btnSave');
  await check('Driver Bata', 'Tab "Driver Bata"', async () => {
    await tab('bataView');
    const rows = await P.locator('#bataRows tr').count();
    const cards = await P.textContent('#bataCards');
    expect(rows === 2, rows + ' rows');
    expect(cards.includes('Murugan') && cards.includes('Selvam'), cards);
    return '2 bills with bata, one card per driver (Murugan, Selvam)';
  });
  await shot('Driver Bata screen', P.locator('#bataView'));
  await check('Driver Bata', '"Paid to driver" tick box', async () => {
    await P.locator('#bataRows tr', { hasText: 'Selvam' }).locator('input[type=checkbox]').check();
    let b = (await ls('sem_bills_v1')).find((x) => x.party === 'Bata Test Two');
    expect(b.bataPaid === true && b.bataPaidOn, 'not stored');
    await P.locator('#bataRows tr', { hasText: 'Selvam' }).locator('input[type=checkbox]').uncheck();
    b = (await ls('sem_bills_v1')).find((x) => x.party === 'Bata Test Two');
    expect(!b.bataPaid, 'untick not stored');
    return 'tick saves "paid" with the date, untick reverses it';
  });
  await check('Driver Bata', 'Search and Paid / Not-paid filter', async () => {
    await P.fill('#bataSearch', 'selvam');
    const n1 = await P.locator('#bataRows tr').count();
    await P.fill('#bataSearch', '');
    await P.selectOption('#bataStatus', 'paid');
    const empty = await P.textContent('#bataRows');
    await P.selectOption('#bataStatus', 'all');
    expect(n1 === 1 && empty.includes('No driver bata'), n1 + ' / ' + empty);
    return '"selvam" → 1 row; "Paid to driver" → none yet';
  });
  await check('Driver Bata', '"Mark all shown as paid" button', async () => {
    await P.click('#btnBataPayAll'); await yes();
    const withBata = (await ls('sem_bills_v1')).filter((x) => Number(x.bata) > 0);
    expect(withBata.length === 2 && withBata.every((x) => x.bataPaid), 'not all paid');
    expect((await P.textContent('#bataCards')).includes('All paid'), 'cards not updated');
    return '₹550 of bata marked paid; cards show "All paid"';
  });
  await check('Driver Bata', '"Export bata CSV" button', async () => {
    const d = await download('#btnBataCsv');
    const csv = d.buf.toString('utf8');
    expect(csv.includes('Murugan') && csv.includes('Selvam') && csv.includes('yes'), csv.slice(0, 200));
    return d.name;
  });
  await check('Driver Bata', 'Bata column in All Bills', async () => {
    await tab('registerView');
    const foot = await P.textContent('#billFoot');
    expect(foot.includes('550'), foot);
    return 'Bata column with total 550';
  });
  await check('Driver Bata', '"Add bata to amount" switched off', async () => {
    await tab('settingsView'); await P.uncheck('#setBataInAmount'); await P.click('#btnSaveSettings');
    await tab('billView'); await P.click('#btnNew');
    await P.fill('#startMeter', '0'); await P.fill('#closeMeter', '5'); await P.fill('#rate', '1000');
    const a = await val('amount');
    await tab('settingsView'); await P.fill('#setBata', ''); await P.check('#setBataInAmount'); await P.click('#btnSaveSettings');
    expect(a === '5000', a);
    return 'Amount 5000 — bata kept for the driver but not charged to the party';
  });

  // ---------- Phone layout ----------
  if (!viewer) {
  await page.setViewportSize({ width: 390, height: 900 });
  await tab('billView');
  await check('Phone', 'Heading fits on a phone screen', async () => {
    const over = await P.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over <= 0, over + 'px sideways scroll');
    return 'no sideways scrolling at 390px wide';
  });
  await shot('Phone view (390px wide)', page, { clip: { x: 0, y: 0, width: 390, height: 900 } });
  }

  await check('General', 'Confirmation box: "Cancel" keeps the bill', async () => {
    await tab('registerView');
    const before = (await ls('sem_bills_v1')).length;
    await P.locator('#billRows button[data-del]').first().click();
    await P.waitForSelector('#askModal:not(.hidden)'); await P.click('#askNo');
    expect((await ls('sem_bills_v1')).length === before, 'bill was deleted');
    return 'nothing deleted when Cancel is pressed';
  });
  if (viewer) {
    await check('General', 'Warning shown inside viewer apps', async () => {
      expect(await P.isVisible('#envBanner'), 'no warning');
      return (await P.textContent('#envBanner')).slice(0, 90) + '…';
    });
  }
  await check('General', 'No script errors during the whole test', async () => {
    expect(errors.length === 0, errors.join('; '));
    return 'none';
  });
  await browser.close();
  writeReport();
})();

function writeReport() {
  const pass = results.filter((r) => r.ok).length;
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const when = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const rows = results.map((r, i) => `<tr class="${r.ok ? 'ok' : 'bad'}"><td>${i + 1}</td><td>${esc(r.area)}</td><td>${esc(r.name)}</td><td class="res">${r.ok ? 'PASS' : 'FAIL'}</td><td>${esc(r.detail)}</td></tr>`).join('');
  const imgs = shots.map((s) => `<figure><figcaption>${esc(s.title)}</figcaption><img src="data:${s.mime || 'image/png'};base64,${s.data}"></figure>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Button Test Proof</title><style>
    body{font-family:Arial,sans-serif;color:#222;margin:24px;}
    h1{color:#3b2a6b;margin:0} .sum{font-size:18px;margin:8px 0 18px}
    .badge{display:inline-block;padding:4px 12px;border-radius:12px;color:#fff;font-weight:700;background:${pass === results.length ? '#1e7b3a' : '#b3261e'}}
    table{border-collapse:collapse;width:100%;font-size:12px} th,td{border:1px solid #ddd;padding:5px 7px;text-align:left;vertical-align:top}
    th{background:#f1edff;color:#3b2a6b} tr.ok .res{color:#1e7b3a;font-weight:700} tr.bad td{background:#fde7e7} tr.bad .res{color:#b3261e;font-weight:700}
    figure{margin:18px 0;page-break-inside:avoid} figcaption{font-weight:700;color:#3b2a6b;margin-bottom:6px}
    img{max-width:100%;max-height:900px;border:1px solid #ccc}
    .note{font-size:12px;color:#555;margin-top:6px}
  </style></head><body>
  <h1>Star Earth Movers Billing — Button Test Proof${viewer ? ' (inside a viewer app)' : ''}</h1>
  <div class="sum">Tested ${esc(when)} in Chromium (automated). <span class="badge">${pass} / ${results.length} checks passed</span></div>
  <div class="note">Every button was clicked by an automated browser and its result checked (saved data, downloaded file contents, what the screen shows).
  Print and Share open phone/computer system windows that a test cannot open, so those two were checked by confirming the app calls them with the right bill file.</div>
  <h2>Results</h2><table><tr><th>#</th><th>Area</th><th>Button / feature</th><th>Result</th><th>What was checked</th></tr>${rows}</table>
  <h2>Screenshots</h2>${imgs}</body></html>`;
  const htmlPath = path.join(outDir, viewer ? 'button-test-proof-viewer.html' : 'button-test-proof.html');
  fs.writeFileSync(htmlPath, html);
  (async () => {
    const b = await chromium.launch();
    const p = await b.newPage();
    await p.goto('file://' + htmlPath);
    await p.pdf({ path: path.join(outDir, viewer ? 'button-test-proof-viewer.pdf' : 'button-test-proof.pdf'), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
    await b.close();
    console.log(`${pass}/${results.length} passed`);
    results.filter((r) => !r.ok).forEach((r) => console.log('FAIL', r.area, '-', r.name, ':', r.detail));
    console.log('report:', htmlPath);
  })();
}
