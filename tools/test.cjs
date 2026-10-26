// usage: BASE=https://... SHOTS=dir node tools/test.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = (process.env.BASE || 'http://localhost:4173').replace(/\/$/, '') + '/';
const SHOTS = process.env.SHOTS;
const VPS = { 'ipad-portrait': [768, 1024], 'ipad-landscape': [1024, 768], iphone: [390, 844] };
const IDS = ['ski', 'textil', 'ebike'];
const NAMES = { ski: 'Ski und Bindungen', textil: 'Bekleidung mit Grössen', ebike: 'E-Bikes mit Rahmennummern' };
const LINES = { ski: 12, textil: 24, ebike: 6 };
const res = {}; const fail = (k, m) => { (res[k] = res[k] || []).push(m); };
const POS = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/docs/positions.json')));
let br;
async function ctx(vp, extra) {
  const c = await br.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: true, isMobile: vp[0] < 500, acceptDownloads: true, deviceScaleFactor: 2, ...extra });
  return c;
}
async function open(page, id, photo) {
  await page.goto(BASE); await page.waitForSelector('.card');
  if (photo) await page.check('#photo');
  await page.click(`.card[data-id="${id}"]`);
  await page.waitForSelector('#rows .row', { timeout: 8000 });
}
async function confirmFlag(page, id) {
  await page.tap('.row.flag');
  await page.waitForSelector('#confirm'); await page.tap('#confirm');
  await page.waitForSelector('.row.done');
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
(async () => {
  br = await chromium.launch();
  // 1 flow + 3 csv
  const csvOut = [];
  for (const [vn, vp] of Object.entries(VPS)) for (const id of IDS) for (const photo of id === 'textil' ? [false, true] : [false]) {
    const c = await ctx(vp); const page = await c.newPage(); const errs = [];
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)));
    const tag = `${vn}/${id}${photo ? '-foto' : ''}`;
    try {
      await open(page, id, photo);
      const sum0 = await page.textContent('#sum');
      if (!sum0.includes(`${LINES[id]} Positionen · ${LINES[id] - 1} automatisch erkannt · 0 geprüft`)) fail('1', tag + ' summary0 ' + sum0);
      const chips0 = await page.textContent('#chips');
      if (!/EAN geprüft ✓/.test(chips0) || !/Summe stimmt mit Lieferschein ✓/.test(chips0) || !/1 Position prüfen/.test(chips0)) fail('1', tag + ' chips ' + chips0);
      if (SHOTS && id === 'textil' && !photo && vn === 'ipad-landscape') { await page.tap('.row:nth-child(5)'); await page.waitForTimeout(700); await shot(page, '2-check-highlight'); }
      if (SHOTS && id === 'ski' && vn === 'ipad-portrait') { await page.tap('.row.flag'); await page.waitForTimeout(700); await shot(page, '3-editor'); }
      if (SHOTS && id === 'textil' && vn === 'iphone' && !photo) { await page.tap('.row:nth-child(3)'); await page.waitForTimeout(700); await shot(page, '6-iphone-check'); }
      // export blocked before confirm
      await page.tap('#toexport');
      if (!(await page.isDisabled('#make'))) fail('1', tag + ' make enabled before confirm');
      await page.tap('#tocheck'); await page.waitForSelector('#rows .row');
      await confirmFlag(page, id);
      const sum1 = await page.textContent('#sum'); if (!sum1.endsWith('· 1 geprüft')) fail('1', tag + ' summary1 ' + sum1);
      if (!/Position geprüft ✓/.test(await page.textContent('#chips'))) fail('1', tag + ' chip not green');
      await page.tap('#toexport');
      if (await page.isDisabled('#make')) fail('1', tag + ' make disabled after confirm');
      if (SHOTS && id === 'textil' && vn === 'ipad-portrait' && !photo) { await page.tap('[data-f="lightspeed"]'); await shot(page, '4-export'); }
      for (const f of ['advarics', 'lightspeed', 'csv']) {
        await page.tap(`[data-f="${f}"]`);
        const [dl] = await Promise.all([page.waitForEvent('download'), page.tap('#make')]);
        const p = await dl.path(); const buf = fs.readFileSync(p);
        csvOut.push({ tag: tag + '/' + f, id, f, buf });
      }
      await page.tap('#tonext'); await page.waitForSelector('.next');
      const t = await page.textContent('.next');
      if (!t.includes('CHF 290, voll angerechnet') || !(await page.$('a[href="tel:+41798940009"]')) || !(await page.$('a[href^="mailto:peeter.mauring@krattid.com"]'))) fail('1', tag + ' next content');
      if (SHOTS && id === 'textil' && vn === 'ipad-portrait' && !photo) await shot(page, '5-next');
      // back resets
      await page.click('#back'); await page.waitForSelector('.card');
      await page.click(`.card[data-id="${id}"]`); await page.waitForSelector('#rows .row');
      if (!(await page.$('.row.flag'))) fail('1', tag + ' no clean reset');
    } catch (e) { fail('1', tag + ' EXC ' + e.message.split('\n')[0]); }
    if (errs.length) fail('1', tag + ' console: ' + errs.join(' | '));
    if (SHOTS && vn === 'ipad-portrait' && id === 'ski' && !photo) { /* start shot below */ }
    await c.close();
  }
  if (SHOTS) { const c = await ctx(VPS['ipad-portrait']); const p = await c.newPage(); await p.goto(BASE); await p.waitForSelector('.card'); await shot(p, '1-start'); await c.close(); }
  // 3 csv
  const counts = {};
  for (const o of csvOut) {
    const s = o.buf.toString('utf8');
    if (!(o.buf[0] === 0xef && o.buf[1] === 0xbb && o.buf[2] === 0xbf)) fail('3', o.tag + ' no BOM');
    if (!s.includes('\r\n') || /[^\r]\n/.test(s)) fail('3', o.tag + ' line ends');
    const rows = s.slice(1).split('\r\n').filter(Boolean);
    if (rows.length !== LINES[o.id] + 1) fail('3', o.tag + ' rows ' + rows.length);
    if (rows[0].split(';').length < 8 || rows[1].split(';').length !== rows[0].split(';').length) fail('3', o.tag + ' semicolons');
    if (!s.includes('Grösse')) fail('3', o.tag + ' no Grösse');
    if (o.id === 'textil' && !s.includes('Jacke Bergföhn')) fail('3', o.tag + ' no Bergföhn');
    if (o.id === 'textil' && !s.includes('M;') && o.f === 'csv' && !/;M;|;L;/.test(s)) fail('3', o.tag + ' size');
    if (o.id === 'ebike' && !s.includes('TS26-0041882')) fail('3', o.tag + ' frame not corrected');
    if (o.id === 'ski' && /26\.5\/27/.test(s)) fail('3', o.tag + ' flag not resolved');
    counts[o.f + '/' + o.id] = rows.length - 1;
  }
  // 2 highlight
  for (const [vn, vp] of Object.entries(VPS)) for (const id of IDS) for (const photo of id === 'textil' ? [false, true] : [false]) {
    const c = await ctx(vp); const page = await c.newPage(); const tag = `${vn}/${id}${photo ? '-foto' : ''}`;
    try {
      await open(page, id, photo);
      const P = POS[id][photo ? 'photo' : 'pdf'].rows; const n = P.length;
      for (const i of [0, Math.floor(n / 2), n - 1]) {
        await page.tap(`.row[data-i="${i}"]`); await page.waitForTimeout(150);
        const st = await page.$eval('#hl', (h) => ({ d: h.style.display, l: h.style.left, t: h.style.top, w: h.style.width, h: h.style.height, r: h.getAttribute('data-row') }));
        const e = P[i];
        const ok = st.d === 'block' && st.r === String(i) && Math.abs(parseFloat(st.l) - e.x * 100) < 0.01 && Math.abs(parseFloat(st.t) - e.y * 100) < 0.01 && Math.abs(parseFloat(st.w) - e.w * 100) < 0.01 && Math.abs(parseFloat(st.h) - e.h * 100) < 0.01;
        if (!ok) fail('2', `${tag} row ${i} ${JSON.stringify(st)}`);
        // visible in scroll pane
        await page.waitForTimeout(700);
        const vis = await page.evaluate(() => { const h = document.getElementById('hl').getBoundingClientRect(); const s = document.getElementById('docscroll').getBoundingClientRect(); return h.top >= s.top - 4 && h.bottom <= s.bottom + 4; });
        if (!vis) fail('2', `${tag} row ${i} not scrolled into view`);
      }
    } catch (e) { fail('2', tag + ' EXC ' + e.message.split('\n')[0]); }
    await c.close();
  }
  // 4 throttling
  const sizes = {};
  for (const id of ['start', ...IDS]) {
    const c = await ctx(VPS['ipad-portrait']); const page = await c.newPage(); const cdp = await c.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
    const t0 = Date.now(); await page.goto(BASE); await page.waitForSelector('h1'); const tm = Date.now() - t0;
    if (id === 'start') { sizes.firstScreenMs = tm; sizes.startKB = Math.round(bytes / 1024); if (tm > 2000) fail('4', 'first screen ' + tm + 'ms'); }
    else {
      await page.click(`.card[data-id="${id}"]`); await page.waitForSelector('#rows .row', { timeout: 15000 });
      await page.waitForFunction(() => { const i = document.querySelector('.docwrap img'); return i && i.complete && i.naturalWidth > 0; });
      if (id === 'textil') { await page.click('#back'); await page.check('#photo'); await page.click('.card[data-id="textil"]'); await page.waitForFunction(() => { const i = document.querySelector('.docwrap img'); return i && i.complete && i.naturalWidth > 0 && /foto/.test(i.src); }); }
      sizes[id + 'KB'] = Math.round(bytes / 1024); if (bytes > 1.5 * 1024 * 1024) fail('4', id + ' assets ' + bytes);
    }
    await c.close();
  }
  // 5 syntax
  const dist = path.join(__dirname, '../dist/assets'); let sx = '';
  if (fs.existsSync(dist)) for (const f of fs.readdirSync(dist)) {
    const s = fs.readFileSync(path.join(dist, f), 'utf8');
    const bad = [/static\s*\{/, /structuredClone/, /:has\(/, /@container/, /\bawait\b/, /\.at\(/, /#[a-z]\w*\s+in\s/, /\?\?=|\|\|=|&&=/, /@layer/, /dvh|svh|lvh/].filter((r) => r.test(s)).map(String);
    if (bad.length) fail('5', f + ' ' + bad.join(',')); sx += f + ' ';
  }
  await br.close();
  console.log(JSON.stringify({ BASE, sizes, counts, failures: res }, null, 1));
  console.log(Object.keys(res).length ? 'SOME FAILED' : 'ALL PASS');
})();
