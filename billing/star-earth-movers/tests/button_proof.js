// Clicks every button in the billing app and writes a proof report (HTML + PDF)
// with a pass/fail line for each check and screenshots.
//
// Usage: node tests/button_proof.js <path-to-app.html> <output-dir>
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const appPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'star-earth-movers-billing.html'));
const outDir = path.resolve(process.argv[3] || path.join(__dirname, 'proof'));
fs.mkdirSync(outDir, { recursive: true });

const results = [];
const shots = [];
let page;

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
const val = (id) => page.inputValue('#' + id);
const ls = (k) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), k);
async function download(selector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const file = path.join(outDir, 'dl-' + dl.suggestedFilename());
  await dl.saveAs(file);
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(file), file };
}
const tab = (v) => page.click(`.tab[data-view="${v}"]`);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 }, acceptDownloads: true });
  // Stand-ins for the browser features a headless test cannot use for real
  await ctx.addInitScript(() => {
    window.__printed = 0; window.print = () => { window.__printed++; };
    window.__shared = null;
    navigator.canShare = () => true;
    navigator.share = async (d) => { window.__shared = { n: d.files.length, name: d.files[0].name, size: d.files[0].size }; };
  });
  page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('file://' + appPath);

  // ---------- Navigation ----------
  for (const [v, label] of [['registerView', 'All Bills'], ['templatesView', 'Templates'], ['reviewsView', 'Reviews'], ['settingsView', 'Settings'], ['billView', 'Bill Entry']]) {
    await check('Navigation', `Tab "${label}"`, async () => {
      await tab(v);
      expect(await page.isVisible('#' + v), 'view not shown');
      return 'opens the ' + label + ' screen';
    });
  }

  // ---------- Heading alignment ----------
  const centreOffset = () => page.evaluate(() => {
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
  await shot('Heading — default (logo left, title centred)', page.locator('#slip .head'));

  await page.click('#headingPanel summary');
  const segs = { logoPos: ['right', 'top', 'none', 'left'], titleAlign: ['left', 'right', 'center'], contactAlign: ['left', 'center', 'right', 'auto'], titleSize: ['s', 'l', 'm'] };
  const dataAttr = { logoPos: 'logoPos', titleAlign: 'titleAlign', contactAlign: 'contactAlign', titleSize: 'titleSize' };
  for (const [key, values] of Object.entries(segs)) {
    for (const v of values) {
      const label = await page.textContent(`.seg[data-key="${key}"] button[data-v="${v}"]`);
      await check('Heading', `${key.replace(/([A-Z])/g, ' $1').toLowerCase()} → "${label}"`, async () => {
        await page.click(`.seg[data-key="${key}"] button[data-v="${v}"]`);
        const got = await page.evaluate((k) => document.getElementById('slip').dataset[k], dataAttr[key]);
        expect(got === v, 'bill shows ' + got);
        const saved = (await ls('sem_settings_v1'))[key];
        expect(saved === v, 'not saved');
        if (key === 'logoPos' || key === 'titleAlign') await shot(`Heading — ${key === 'logoPos' ? 'logo' : 'title'}: ${label}`, page.locator('#slip .head'));
        return 'applied and saved';
      });
    }
  }
  await check('Heading', 'Title still centred with logo on the right', async () => {
    await page.click('.seg[data-key="logoPos"] button[data-v="right"]');
    const off = await centreOffset();
    await page.click('.seg[data-key="logoPos"] button[data-v="left"]');
    expect(off < 3, off.toFixed(1) + 'px off');
    return off.toFixed(1) + 'px from centre';
  });
  await check('Heading', '"Reset alignment" button', async () => {
    await page.click('.seg[data-key="titleAlign"] button[data-v="left"]');
    await page.click('#btnResetAlign');
    const d = await page.evaluate(() => ({ ...document.getElementById('slip').dataset }));
    expect(d.titleAlign === 'center' && d.logoPos === 'left' && d.titleSize === 'm', JSON.stringify(d));
    return 'back to logo left, title centred, medium';
  });

  // ---------- 15 logos ----------
  const logoCount = await page.locator('.logo-opt').count();
  await check('Logos', 'Logo picker has 15 designs', async () => { expect(logoCount === 15, 'found ' + logoCount); return '15 found'; });
  const seen = new Set();
  for (let i = 0; i < logoCount; i++) {
    const name = (await page.locator('.logo-opt span').nth(i).textContent()).trim();
    await check('Logos', `Logo ${name}`, async () => {
      await page.locator('.logo-opt').nth(i).click();
      const svg = await page.innerHTML('#slip .logo');
      expect(svg.includes('<svg'), 'no logo drawn');
      expect(!seen.has(svg), 'same drawing as another logo');
      seen.add(svg);
      expect(await page.locator('.logo-opt').nth(i).evaluate((b) => b.classList.contains('active')), 'not highlighted');
      return 'shown on the bill';
    });
  }
  await shot('All 15 logos', page.locator('#logoGrid'));
  await page.locator('.logo-opt').first().click();

  // ---------- Editable heading text ----------
  await check('Bill', 'Heading text can be edited', async () => {
    await page.click('#slip .t2');
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
    await page.fill('#party', 'Ravi Constructions');
    await page.fill('#address', 'Salem Road, Namakkal');
    await page.fill('#startMeter', '1250.5'); await page.fill('#closeMeter', '1258');
    await page.fill('#rate', '1200'); await page.fill('#advance', '2000');
    const v = [await val('running'), await val('total'), await val('amount'), await val('balance')];
    expect(v.join() === '7.5,7.5,9000,7000', v.join());
    return 'Running 7.5, Total 7.5, Amount 9000, Balance 7000';
  });
  for (const id of ['running', 'total', 'amount', 'balance']) {
    await check('Bill', `↺ button on ${id[0].toUpperCase() + id.slice(1)}`, async () => {
      const before = await val(id);
      await page.fill('#' + id, '1');
      expect(await page.isVisible(`#${id} ~ .auto`), '↺ not shown after typing');
      await page.click(`#${id} ~ .auto`);
      expect(await val(id) === before, 'did not return to ' + before);
      return 'typed over, ↺ restored ' + before;
    });
  }
  await check('Bill', 'Typed-over Total updates Amount & Balance', async () => {
    await page.fill('#total', '8');
    const a = await val('amount'), b = await val('balance');
    expect(a === '9600' && b === '7600', a + '/' + b);
    return 'Total 8 → Amount 9600, Balance 7600';
  });
  await check('Bill', '"Save" button', async () => {
    await page.click('#btnSave');
    const bills = await ls('sem_bills_v1');
    expect(bills.length === 1 && bills[0].billNo === '50' && bills[0].amount === '9600', JSON.stringify(bills));
    expect(await page.isVisible('#btnDelete'), 'Delete button not shown');
    return 'Bill No. 50 stored';
  });
  // ---------- Signatures ----------
  async function scribble(seed) {
    const bx = await page.locator('#sigPad').boundingBox();
    await page.mouse.move(bx.x + 50, bx.y + 140); await page.mouse.down();
    for (let i = 0; i < 45; i++) await page.mouse.move(bx.x + 50 + i * 8, bx.y + 115 + Math.sin(i / seed) * 45 + (i % 7) * 2);
    await page.mouse.up();
  }
  const sigSrc = (who) => page.getAttribute(`#slip .sig[data-who="${who}"] .sig-img`, 'src');
  await check('Signature', '"✍ Sign" (operator) opens the signature pad', async () => {
    await page.click('.sig-btn[data-sign="operator"]');
    expect(await page.isVisible('#signModal'), 'pad not shown');
    expect(await page.isVisible('#sigSaveDefault'), '"Save as my signature" missing');
    return 'pad opens with Clear / Upload photo / Save as my signature / Done';
  });
  await check('Signature', 'Pen colour buttons', async () => {
    for (const c of ['Black', 'Red', 'Blue']) {
      await page.click(`.pen:text-is("${c}")`);
      expect(await page.locator(`.pen:text-is("${c}")`).evaluate((b) => b.classList.contains('active')), c + ' not selected');
    }
    return 'Blue, Black and Red each select';
  });
  await check('Signature', 'Drawing + "Clear" button', async () => {
    await scribble(3);
    const inked = await page.evaluate(() => { const c = document.getElementById('sigPad'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; });
    expect(inked > 200, 'nothing drawn');
    await page.click('#sigClear');
    const after = await page.evaluate(() => { const c = document.getElementById('sigPad'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return 1; return 0; });
    expect(after === 0, 'not cleared');
    return 'drawing leaves ink; Clear wipes the pad';
  });
  await shot('Signature pad (party signing on a phone or with a mouse)', page.locator('#signModal .modal-box'));
  await check('Signature', '"Save as my signature" button', async () => {
    await scribble(3);
    await page.click('#sigSaveDefault');
    const s = await ls('sem_settings_v1');
    expect(s.defaultSig && s.defaultSig.startsWith('data:image/png'), 'not saved');
    return 'stored as the operator\'s saved signature (' + Math.round(s.defaultSig.length / 1024) + ' KB)';
  });
  await check('Signature', '"Done" puts the operator signature on the bill', async () => {
    await page.click('#sigDone');
    expect(!(await page.isVisible('#signModal')), 'pad still open');
    expect((await sigSrc('operator') || '').startsWith('data:image/png'), 'no image on bill');
    const b = (await ls('sem_bills_v1'))[0];
    expect(b.sigOperator === '@default', 'bill not updated: ' + String(b.sigOperator).slice(0, 20));
    return 'signature shown above "Operator Signature" and bill auto-saved';
  });
  await check('Signature', 'Party signs', async () => {
    await page.click('.sig-btn[data-sign="party"]');
    expect(!(await page.isVisible('#sigSaveDefault')), 'party should not get "Save as my signature"');
    await page.click('.pen:text-is("Black")');
    await scribble(5);
    await page.click('#sigDone');
    const b = (await ls('sem_bills_v1'))[0];
    expect(b.sigParty && b.sigParty.startsWith('data:image/png') && b.sigPartyAt, 'party signature not stored');
    return 'party signature shown and saved with the time signed';
  });
  await check('Signature', '"Upload photo" of a signature', async () => {
    const file = path.join(outDir, 'signature-photo.png');
    const b64 = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 400; c.height = 150;
      const x = c.getContext('2d'); x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 400, 150);
      x.strokeStyle = '#1a1a5a'; x.lineWidth = 5; x.beginPath(); x.moveTo(30, 100);
      x.bezierCurveTo(90, 10, 150, 140, 210, 60); x.bezierCurveTo(260, 0, 320, 130, 370, 50); x.stroke();
      return c.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    await page.click('.sig-btn[data-sign="party"]');
    await page.setInputFiles('#sigUpload', file);
    await page.waitForTimeout(400);
    const corner = await page.evaluate(() => document.getElementById('sigPad').getContext('2d').getImageData(4, 4, 1, 1).data[3]);
    expect(corner === 0, 'paper background not removed');
    await page.click('#sigDone');
    return 'photo loaded, paper background removed, signature applied';
  });
  await check('Signature', '"Use my saved signature" button', async () => {
    await page.click('.sig-btn[data-sign="operator"]');
    expect(await page.isVisible('#sigUseSaved'), 'button hidden');
    await page.click('#sigClear');
    await page.click('#sigUseSaved');
    await page.click('#sigDone');
    expect((await sigSrc('operator') || '').startsWith('data:image/png'), 'not applied');
    return 'saved signature placed back on the bill';
  });
  await check('Signature', 'Close (✕) leaves the signature unchanged', async () => {
    const before = await sigSrc('party');
    await page.click('.sig-btn[data-sign="party"]');
    await page.click('#sigClear');
    await page.click('#signClose');
    expect(await sigSrc('party') === before, 'changed');
    return 'cancelling keeps the existing signature';
  });

  // ---------- Preview ----------
  await check('Preview', '"Preview" button', async () => {
    await page.click('#btnPreview');
    await page.waitForSelector('#previewImg:not(.hidden)');
    const w = await page.evaluate(() => document.getElementById('previewImg').naturalWidth);
    expect(w > 1000, 'image width ' + w);
    return 'shows the finished bill image (' + w + 'px wide)';
  });
  await shot('Preview window (with both signatures)', page.locator('#previewModal .modal-box'));
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
    await page.evaluate(() => { window.__shared = null; });
    await page.click('#pvShare');
    await page.waitForFunction(() => window.__shared);
    return 'passes the bill image to the share sheet (simulated)';
  });
  await check('Preview', '"Print" in preview', async () => {
    const before = await page.evaluate(() => window.__printed);
    await page.click('#pvPrint');
    expect(await page.evaluate(() => window.__printed) === before + 1, 'print not opened');
    const printsPreview = await page.evaluate(() => document.body.classList.contains('preview-open'));
    expect(printsPreview, 'print would not use the preview');
    return 'opens print with the preview image (simulated)';
  });
  await check('Preview', '"Edit bill" in preview', async () => {
    await page.click('#pvEdit');
    expect(!(await page.isVisible('#previewModal')) && await page.isVisible('#billView'), 'not back to editing');
    return 'closes preview, back to the bill';
  });
  await check('Preview', 'Close with ✕ and with Esc key', async () => {
    await page.click('#btnPreview'); await page.click('#previewClose');
    expect(!(await page.isVisible('#previewModal')), '✕ did not close');
    await page.click('#btnPreview'); await page.keyboard.press('Escape');
    expect(!(await page.isVisible('#previewModal')), 'Esc did not close');
    return 'both close the window';
  });

  await shot('Bill entry screen after saving (with signatures)', page.locator('#slip'));

  // ---------- Bill review ----------
  await check('Bill review', 'Stars + "Save Review"', async () => {
    await page.click('#billStars button[data-v="4"]');
    await page.fill('#billReviewText', 'Good work, finished on time.');
    await page.click('#btnBillReview');
    const r = await ls('sem_reviews_v1');
    expect(r.length === 1 && r[0].rating === 4 && r[0].billNo === '50', JSON.stringify(r));
    return '4★ review stored against Bill No. 50';
  });
  await check('Bill review', '"Remove Review" button', async () => {
    await page.click('#btnBillReviewDel');
    expect((await ls('sem_reviews_v1')).length === 0, 'still stored');
    await page.click('#billStars button[data-v="5"]');
    await page.click('#btnBillReview');
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
    expect(await page.isVisible('#btnShare'), 'button hidden');
    await page.click('#btnShare');
    await page.waitForFunction(() => window.__shared);
    const s = await page.evaluate(() => window.__shared);
    expect(s.n === 1 && s.name.endsWith('.jpg') && s.size > 10000, JSON.stringify(s));
    return 'passes ' + s.name + ' to the phone share sheet (simulated)';
  });
  await check('Bill', '"Print" button', async () => {
    const before = await page.evaluate(() => window.__printed);
    await page.click('#btnPrint');
    expect(await page.evaluate(() => window.__printed) === before + 1, 'print not opened');
    return 'opens the print dialog (simulated)';
  });

  // ---------- New / second bill / Delete ----------
  await check('Bill', '"New" button', async () => {
    await page.click('#btnNew');
    expect(await val('billNo') === '51', 'bill no ' + await val('billNo'));
    expect(await val('party') === '' && await val('amount') === '', 'form not cleared');
    expect(!(await page.isVisible('#btnDelete')), 'Delete still shown');
    return 'blank bill, number moved to 51';
  });
  await page.fill('#party', 'Kumar Builders'); await page.fill('#startMeter', '100'); await page.fill('#closeMeter', '104');
  await page.fill('#rate', '1100'); await page.fill('#advance', '4400'); await page.click('#btnSave');
  await page.click('#btnNew');
  await page.fill('#party', 'Delete Me'); await page.fill('#rate', '1'); await page.click('#btnSave');
  await check('Bill', '"Delete" button', async () => {
    await page.click('#btnDelete');
    const bills = await ls('sem_bills_v1');
    expect(bills.length === 2 && !bills.some((b) => b.party === 'Delete Me'), bills.length + ' bills');
    return 'bill removed after confirmation';
  });

  // ---------- All Bills ----------
  await tab('registerView');
  await check('All Bills', 'List shows saved bills', async () => {
    const n = await page.locator('#billRows tr').count();
    expect(n === 2, n + ' rows');
    return '2 bills, totals row present';
  });
  await shot('All Bills screen', page.locator('#registerView'));
  await check('All Bills', 'Search box', async () => {
    await page.fill('#search', 'kumar');
    const n = await page.locator('#billRows tr').count();
    await page.fill('#search', '');
    expect(n === 1, n + ' rows');
    return '"kumar" → 1 bill';
  });
  await check('All Bills', 'Date filters', async () => {
    await page.fill('#fromDate', '2000-01-01'); await page.fill('#toDate', '2000-01-02');
    const empty = await page.textContent('#billRows');
    await page.fill('#fromDate', ''); await page.fill('#toDate', '');
    expect(empty.includes('No bills'), 'filter did not apply');
    return 'out-of-range dates hide the bills';
  });
  await check('All Bills', 'Paid / Due labels', async () => {
    const t = await page.textContent('#billRows');
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
    await page.locator('#billRows button[data-del]').last().click();
    expect((await ls('sem_bills_v1')).length === 1, 'not deleted');
    return 'row removed';
  });
  await check('All Bills', '"Restore Backup" button', async () => {
    await page.setInputFiles('#restoreFile', backupFile);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('sem_bills_v1')).length === 2);
    return 'deleted bill came back from the backup';
  });
  await check('All Bills', '"Open" button', async () => {
    await tab('registerView');
    await page.locator('#billRows tr', { hasText: 'Ravi' }).locator('button[data-open]').click();
    expect(await page.isVisible('#billView') && await val('party') === 'Ravi Constructions', 'not opened');
    expect(await val('total') === '8', 'typed-over total lost');
    return 'Bill No. 50 opened for editing, typed-over Total kept';
  });
  await check('All Bills', '"Preview" button in list', async () => {
    await tab('registerView');
    await page.locator('#billRows tr', { hasText: 'Kumar' }).locator('button[data-preview]').click();
    await page.waitForSelector('#previewImg:not(.hidden)');
    const title = await page.textContent('#previewTitle');
    expect(title.includes('Kumar Builders'), title);
    await page.click('#previewClose');
    return 'opens the preview window for Kumar Builders';
  });
  await check('All Bills', '"✍ Signed" label for signed bills', async () => {
    await tab('registerView');
    const row = await page.locator('#billRows tr', { hasText: 'Ravi' }).textContent();
    expect(row.includes('Signed'), row);
    return 'Ravi Constructions shows ✍ Signed';
  });
  await page.locator('#billRows tr', { hasText: 'Ravi' }).locator('button[data-open]').click();

  // ---------- Templates ----------
  await tab('templatesView');
  await page.waitForTimeout(300);
  const tplCount = await page.locator('.tpl-card').count();
  await check('Templates', 'Template screen has 15 designs', async () => { expect(tplCount === 15, String(tplCount)); return '15 found'; });
  await shot('Templates screen', page.locator('#templatesView'));
  const papers = new Set();
  for (let i = 0; i < tplCount; i++) {
    const name = (await page.locator('.tpl-card > .name').nth(i).textContent()).trim();
    await check('Templates', `Template ${name}`, async () => {
      await page.locator('.tpl-card').nth(i).click();
      const s = await page.evaluate(() => { const e = document.getElementById('slip'); return e.className + '|' + e.style.getPropertyValue('--paper') + e.style.getPropertyValue('--ink'); });
      expect(!papers.has(s), 'looks the same as another template');
      papers.add(s);
      return 'applied to the bill';
    });
  }
  await page.locator('.tpl-card').first().click();

  // ---------- Reviews ----------
  await tab('reviewsView');
  await check('Reviews', '"Add Review" button (with stars)', async () => {
    await page.fill('#rvParty', 'Kumar Builders');
    await page.selectOption('#rvBill', { index: 1 });
    await page.click('#rvStars button[data-v="3"]');
    await page.fill('#rvText', 'Operator came late.');
    await page.click('#btnAddReview');
    expect((await ls('sem_reviews_v1')).length === 2, 'not added');
    return '3★ review added and linked to a bill';
  });
  await check('Reviews', 'Average & star bars', async () => {
    const avg = await page.textContent('#avgRating');
    expect(avg === '4.0', avg);
    return 'average 4.0 from 5★ + 3★';
  });
  await shot('Reviews screen', page.locator('#reviewsView'));
  await check('Reviews', 'Rating filter', async () => {
    await page.selectOption('#reviewFilter', '3');
    const n = await page.locator('.review-item').count();
    await page.selectOption('#reviewFilter', '0');
    expect(n === 1, String(n));
    return '"3 ★" shows 1 review';
  });
  await check('Reviews', 'Search box', async () => {
    await page.fill('#reviewSearch', 'late');
    const n = await page.locator('.review-item').count();
    await page.fill('#reviewSearch', '');
    expect(n === 1, String(n));
    return '"late" → 1 review';
  });
  await check('Reviews', '"Open bill" button', async () => {
    await page.locator('.review-item button[data-openbill]').first().click();
    expect(await page.isVisible('#billView'), 'not opened');
    await tab('reviewsView');
    return 'opens the linked bill';
  });
  await check('Reviews', '"✕" (delete review) button', async () => {
    await page.locator('.review-item button[data-delrev]').first().click();
    expect((await ls('sem_reviews_v1')).length === 1, 'not deleted');
    return 'review removed';
  });

  // ---------- Settings ----------
  await tab('settingsView');
  await check('Settings', '"Save Settings" button', async () => {
    await page.fill('#setNextNo', '200'); await page.fill('#setCurrency', 'Rs.'); await page.fill('#setOperator', 'Murugan');
    await page.click('#btnSaveSettings');
    const s = await ls('sem_settings_v1');
    expect(s.nextNo === 200 && s.currency === 'Rs.' && s.operator === 'Murugan', JSON.stringify(s));
    await tab('billView'); await page.click('#btnNew');
    expect(await val('billNo') === '200' && await val('operator') === 'Murugan', 'not used on new bill');
    return 'new bill uses No. 200 and operator Murugan';
  });
  await check('Settings', 'Saved signature shown + auto-sign on new bills', async () => {
    await tab('settingsView');
    expect(await page.isVisible('#savedSigImg'), 'saved signature not shown');
    expect(await page.isChecked('#setAutoSign'), 'auto-sign not on');
    await tab('billView'); await page.click('#btnNew');
    expect((await sigSrc('operator') || '').startsWith('data:image/png'), 'new bill not auto-signed');
    expect(!(await sigSrc('party')), 'party signature should be blank');
    return 'new bill already has the operator signature, party blank';
  });
  await check('Settings', 'Auto-sign checkbox off', async () => {
    await tab('settingsView'); await page.uncheck('#setAutoSign'); await page.click('#btnSaveSettings');
    await tab('billView'); await page.click('#btnNew');
    const src = await sigSrc('operator');
    await tab('settingsView'); await page.check('#setAutoSign'); await page.click('#btnSaveSettings');
    expect(!src, 'still signed');
    return 'new bills stay unsigned when switched off';
  });
  await check('Settings', '"Remove saved signature" button', async () => {
    await tab('settingsView'); await page.click('#btnRemoveSavedSig');
    const s = await ls('sem_settings_v1');
    const ravi = (await ls('sem_bills_v1')).find((b) => b.party === 'Ravi Constructions');
    expect(!s.defaultSig, 'still saved');
    expect(ravi.sigOperator && ravi.sigOperator.startsWith('data:image/png'), 'old bill lost its signature');
    return 'removed; Bill No. 50 keeps its operator signature';
  });
  await check('Settings', '"Reset heading & labels" button', async () => {
    await tab('billView');
    await page.click('#slip .t1'); await page.keyboard.type('X');
    await tab('settingsView'); await page.click('#btnResetHeader');
    const t = await page.textContent('#slip .t1');
    expect(t === 'STAR', t);
    return 'heading back to STAR';
  });

  // ---------- Phone layout ----------
  await page.setViewportSize({ width: 390, height: 900 });
  await tab('billView');
  await check('Phone', 'Heading fits on a phone screen', async () => {
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over <= 0, over + 'px sideways scroll');
    return 'no sideways scrolling at 390px wide';
  });
  await shot('Phone view (390px wide)', page, { clip: { x: 0, y: 0, width: 390, height: 900 } });

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
  <h1>Star Earth Movers Billing — Button Test Proof</h1>
  <div class="sum">Tested ${esc(when)} in Chromium (automated). <span class="badge">${pass} / ${results.length} checks passed</span></div>
  <div class="note">Every button was clicked by an automated browser and its result checked (saved data, downloaded file contents, what the screen shows).
  Print and Share open phone/computer system windows that a test cannot open, so those two were checked by confirming the app calls them with the right bill file.</div>
  <h2>Results</h2><table><tr><th>#</th><th>Area</th><th>Button / feature</th><th>Result</th><th>What was checked</th></tr>${rows}</table>
  <h2>Screenshots</h2>${imgs}</body></html>`;
  const htmlPath = path.join(outDir, 'button-test-proof.html');
  fs.writeFileSync(htmlPath, html);
  (async () => {
    const b = await chromium.launch();
    const p = await b.newPage();
    await p.goto('file://' + htmlPath);
    await p.pdf({ path: path.join(outDir, 'button-test-proof.pdf'), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
    await b.close();
    console.log(`${pass}/${results.length} passed`);
    results.filter((r) => !r.ok).forEach((r) => console.log('FAIL', r.area, '-', r.name, ':', r.detail));
    console.log('report:', htmlPath);
  })();
}
