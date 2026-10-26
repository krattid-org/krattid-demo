// usage: BASE=https://demo.krattid.com SHOTS=dir TEMPLATE=path node tools/test.cjs
// Runs in Chromium with touch/mobile emulation (WebKit is not installable in the CI container).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const BASE = (process.env.BASE || 'http://127.0.0.1:4173').replace(/\/$/, '') + '/';
const SHOTS = process.env.SHOTS;
const TEMPLATE = process.env.TEMPLATE || path.join(__dirname, 'lightspeed-template.txt');
const VPS = { 'ipad-portrait': [768, 1024], 'ipad-landscape': [1024, 768], iphone: [390, 844] };
const IDS = ['ski', 'textil', 'ebike'];
const LINES = { ski: 12, textil: 24, ebike: 6 };
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/examples.json'), 'utf8'));
const res = {}; const fail = (k, m) => { (res[k] = res[k] || []).push(m); };
const check = (k, c, m) => { if (!c) fail(k, m); };
let br;
const ctx = (vp, o) => br.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: true, isMobile: true, acceptDownloads: true, deviceScaleFactor: 2, ...o });
async function open(page, id, photo) {
  page.setDefaultTimeout(10000);
  const tap = page.tap ? 'tap' : 'click';
  await page.goto(BASE); await page.waitForSelector('.card');
  if (photo) await page.check('#photo');
  await page.click(`.card[data-id="${id}"]`);
  await page.waitForSelector('#rows .row', { timeout: 8000 });
  await page.waitForTimeout(450);
}
// scroll an element into the free area between the sticky header/viewer and the sticky bottom bar, then tap it
async function bring(page, sel) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel); if (!el) return;
    const pane = document.querySelector('#docpane'), bar = document.querySelector('#barx');
    const land = innerWidth > innerHeight && innerHeight >= 500;
    const top = land ? document.querySelector('#top').offsetHeight : (pane ? document.querySelector('#top').offsetHeight + 6 + pane.offsetHeight : 0);
    const bot = bar ? bar.getBoundingClientRect().top : innerHeight;
    const r = el.getBoundingClientRect();
    if (r.top < top + 8 || r.bottom > bot - 8) window.scrollBy(0, r.top - top - 24);
  }, sel);
  await page.waitForTimeout(120);
}
const T = async (page, sel, o) => { await bring(page, sel); try { await page.tap(sel, o); } catch (e) { throw new Error('tap ' + sel + ' ' + e.message.split('\n').slice(0, 1).join() + ' ' + e.message.split('\n').filter((l) => /intercept|not enabled/.test(l)).join()); } };
async function confirm(page, opt) {
  await T(page, `.row.flag .opt:nth-child(${opt || 1})`);
  await T(page, '#confirm');
  await page.waitForSelector('.row.done');
}
async function shot(page, name) { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); }
const view = (page) => page.$eval('#vbox', (b) => ({ s: +b.dataset.scale, tx: +b.dataset.tx, ty: +b.dataset.ty }));
const boxRect = (page) => page.$eval('#vbox', (b) => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const hlCenter = (page) => page.$eval('#hl', (p) => { const r = p.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, r: r.right, b: r.bottom, l: r.left, t: r.top }; });
async function touch(cdp, type, pts) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) }); }
async function pinch(page, cdp, cx, cy, d0, d1) {
  await touch(cdp, 'touchStart', [[cx - d0 / 2, cy], [cx + d0 / 2, cy]]);
  const n = 8;
  for (let i = 1; i <= n; i++) { const d = d0 + (d1 - d0) * i / n; await touch(cdp, 'touchMove', [[cx - d / 2, cy], [cx + d / 2, cy]]); await page.waitForTimeout(16); }
  await touch(cdp, 'touchEnd', []);
}

(async () => {
  br = await chromium.launch();
  const tpl = fs.readFileSync(TEMPLATE, 'latin1').split('\r')[0];

  // ---- 1 flow, texts, back navigation, no console errors ----
  for (const [vn, vp] of Object.entries(VPS)) for (const id of IDS) for (const photo of id === 'textil' ? [false, true] : [false]) {
    const c = await ctx(vp); const page = await c.newPage(); const errs = [];
    page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(String(e)));
    const tag = `${vn}/${id}${photo ? '-foto' : ''}`;
    try {
      await page.goto(BASE); await page.waitForSelector('.card');
      check('1', await page.$eval('#back', (b) => getComputedStyle(b).display === 'none'), tag + ' back visible on start');
      check('1', (await page.textContent('.tag')).trim() === 'Beispiel mit fiktivem Lieferanten', tag + ' tag');
      check('1', (await page.textContent('.foot')).trim() === 'krattid_ · Mauring Digital Solutions · Peeter Mauring, Neschwil · krattid.com', tag + ' footer');
      check('1', (await page.textContent('#app')).includes('Bekleidung mit Grössen (Auftragsbestätigung)') && (await page.textContent('#app')).includes('Als Handyfoto statt PDF zeigen'), tag + ' start texts');
      if (photo) await page.check('#photo');
      await page.tap(`.card[data-id="${id}"]`);
      await page.waitForSelector('.steps');
      check('1', (await page.$$eval('.steps li', (l) => l.map((x) => x.textContent).join(' → '))) === 'Zeilen lesen → EAN prüfen → Summe prüfen', tag + ' steps');
      check('1', (await page.textContent('.tag')).includes('fiktivem'), tag + ' tag on reading');
      await page.waitForSelector('#rows .row', { timeout: 8000 }); await page.waitForTimeout(450);
      const n = LINES[id];
      check('1', (await page.textContent('#sum')) === `${n - 1} von ${n} Positionen sicher erkannt · 1 zum Bestätigen`, tag + ' sum0 ' + await page.textContent('#sum'));
      check('1', (await page.textContent('#h1')) === 'Bitte kurz prüfen', tag + ' h1');
      const chips = await page.textContent('#chips');
      check('1', chips.includes('EAN-Prüfziffern stimmen ✓') && chips.includes('Summe stimmt mit dem Dokument ✓') && chips.includes('1 Position bestätigen'), tag + ' chips ' + chips);
      const body = await page.textContent('body');
      check('1', !/PDF öffnen/.test(body) && !(await page.$('a[download]')) && !/Saison/.test(body), tag + ' pdf/saison text');
      check('1', (await page.textContent('.dtitle')).trim() === DATA.find((e) => e.id === id).supplier, tag + ' viewer title');
      // flagged row open by default; tapping it does not collapse
      check('1', !!(await page.$('.row.flag .editor')), tag + ' editor not open');
      await T(page, '.row.flag .ed-h'); await T(page, '.row.flag .r1');
      check('1', !!(await page.$('.row.flag .editor')), tag + ' editor collapsed on tap');
      // bar disabled
      check('1', (await page.getAttribute('#toexport', 'aria-disabled')) === 'true' && (await page.textContent('#barhint')) === 'Noch 1 Position bestätigen', tag + ' bar not disabled');
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(100);
      await page.tap('#toexport', { force: true }); await page.waitForTimeout(900);
      const ft = await page.$eval('.row.flag', (r) => { const b = r.getBoundingClientRect(); return b.top < innerHeight && b.bottom > 0; });
      check('1', ft, tag + ' disabled bar did not scroll to flagged row');
      check('1', (await page.evaluate(() => document.querySelector('#h1') !== null)), tag + ' stayed on review');
      // options as read
      const opts = (await page.$$eval('.row.flag .opt', (o) => o.map((x) => x.textContent))).join('|');
      const want = { ski: '26.5|27|26.5/27 (wie gelesen)', textil: 'M|L|M/L (wie gelesen)', ebike: 'TS26-0041882 (Vorschlag)|TS26-O041882 (wie gelesen)' }[id];
      check('1', opts === want, tag + ' options ' + opts);
      check('1', await page.$eval('#confirm', (b) => b.disabled), tag + ' confirm enabled w/o choice');
      if (id === 'ebike') {
        const hint = await page.textContent('.row.flag .hint');
        check('1', hint === 'Gelesen: Buchstabe O · Vorschlag: Ziffer 0', tag + ' hint ' + hint);
        check('1', (await page.$$eval('.row.flag .opt .diff', (d) => d.map((x) => x.textContent).join(''))) === '0O', tag + ' diff chars in options');
        check('1', (await page.$$eval('.row.flag .cells .diff', (d) => d.map((x) => x.textContent).join(''))) === 'O', tag + ' diff char in row');
        const col = await page.$eval('.row.flag .opt .diff', (d) => getComputedStyle(d).color);
        check('1', col === 'rgb(200, 16, 46)', tag + ' diff colour ' + col);
        const ff = await page.$eval('.row.flag .opt', (d) => getComputedStyle(d).fontFamily);
        check('1', /mono|Menlo/i.test(ff), tag + ' opt font ' + ff);
        const tops = await page.$$eval('.row.flag .opt', (o) => o.map((x) => x.getBoundingClientRect().top));
        check('1', tops[1] > tops[0], tag + ' options not on separate lines');
      }
      if (SHOTS && id === 'ebike' && vn === 'ipad-portrait') { await page.evaluate(() => document.querySelector('.row.flag').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); await shot(page, '2-flagged-ebike'); }
      if (SHOTS && id === 'ebike' && vn === 'iphone') { await page.evaluate(() => document.querySelector('.row.flag').scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); await shot(page, '5-iphone-review'); }
      await confirm(page, 1);
      check('1', (await page.textContent('#h1')) === 'Alles geprüft', tag + ' h1 after');
      check('1', (await page.textContent('#sum')) === `Alle ${n} Positionen geprüft`, tag + ' sum after');
      check('1', (await page.textContent('#chips')).includes('1 Position bestätigt ✓'), tag + ' chip after');
      check('1', (await page.getAttribute('#toexport', 'aria-disabled')) === 'false', tag + ' bar still disabled');
      // export screen
      await page.tap('#toexport'); await page.waitForSelector('.fmt');
      check('1', (await page.textContent('h1')) === 'Wählen Sie, in welchem Format Sie die Datei brauchen', tag + ' export h1');
      const h2 = await page.$$eval('h2', (h) => h.map((x) => x.textContent).join('|'));
      check('1', h2 === 'Vorschau der Datei|Datei herunterladen', tag + ' h2 ' + h2);
      const prim = await page.$$eval('.btn', (bs) => bs.filter((b) => getComputedStyle(b).backgroundColor === 'rgb(255, 77, 0)').map((b) => b.textContent));
      check('1', prim.length === 1 && prim[0] === 'Weiter', tag + ' primary buttons ' + prim);
      check('1', (await page.$$eval('.fmt .btn', (b) => b.map((x) => x.textContent).join('|'))) === 'Excel / CSV|Lightspeed OnSite|Advarics (Beispielformat)', tag + ' formats');
      if (SHOTS && id === 'ski' && vn === 'ipad-portrait') { await page.tap('[data-f="lightspeed"]'); await page.waitForTimeout(200); await shot(page, '3-export-lightspeed'); }
      // back one screen: export -> review
      await page.goBack(); await page.waitForSelector('#rows .row');
      check('1', (await page.textContent('#h1')) === 'Alles geprüft', tag + ' back to review lost state');
      await page.goForward(); await page.waitForSelector('.fmt');
      await page.tap('#tonext'); await page.waitForSelector('.next');
      const nt = await page.textContent('.next');
      check('1', nt.includes('Mit Ihren eigenen Lieferscheinen testen') && nt.includes('Der Testlauf kostet CHF 290. Wenn wir danach zusammenarbeiten, ziehe ich den Betrag ab. Ganz unverbindlich.') && nt.includes('079 894 00 09') && nt.includes('peeter.mauring@krattid.com') && nt.includes('Mehr über mich (krattid.com)') && nt.includes('Peeter Mauring · bis Frühling 2026 bei Ski Service Corvatsch im Verkauf und Bootfitting. Ich komme gern persönlich vorbei.'), tag + ' last screen texts');
      await page.waitForFunction(() => { const i = document.querySelector('.who img'); return i && i.complete; }, null, { timeout: 8000 }).catch(() => {});
      const ph = await page.$eval('.who img', (i) => ({ ok: i.complete && i.naturalWidth > 0 }));
      check('1', ph.ok, tag + ' portrait not loaded');
      if (SHOTS && id === 'textil' && vn === 'ipad-portrait' && !photo) await shot(page, '4-last');
      await page.goBack(); await page.waitForSelector('.fmt');
      await page.goBack(); await page.waitForSelector('#rows .row');
      await page.goBack(); await page.waitForSelector('.card');
      check('1', !(await page.$('#rows')) && (await page.$eval('#back', (b) => getComputedStyle(b).display === 'none')), tag + ' back to start');
      // Zurück zum Start button from deep screen
      await page.tap(`.card[data-id="${id}"]`); await page.waitForSelector('#rows .row'); await page.waitForTimeout(300);
      await page.tap('#back'); await page.waitForSelector('.card');
    } catch (e) { fail('1', tag + ' EXC ' + (e.message.split('\n')[0] + ' @' + (e.stack.split('\n').find((l) => l.includes('test.cjs')) || '').trim())); }
    if (errs.length) fail('1', tag + ' console: ' + errs.join(' ; '));
    await c.close();
  }

  // ---- 2 zoom ----
  for (const [vn, vp] of Object.entries(VPS)) for (const photo of [false, true]) {
    const id = 'textil';
    const c = await ctx(vp); const page = await c.newPage(); const cdp = await c.newCDPSession(page); const tag = `${vn}${photo ? '-foto' : ''}`;
    try {
      await open(page, id, photo);
      await page.evaluate(() => window.scrollTo(0, 0));
      const r0 = await boxRect(page);
      const v0 = await view(page);
      // 40% of height in portrait
      if (vp[1] > vp[0]) check('2', r0.h <= vp[1] * 0.42, tag + ' viewer too tall ' + r0.h);
      // pinch out
      const cx = r0.x + r0.w / 2, cy = r0.y + r0.h / 2;
      await pinch(page, cdp, cx, cy, 80, 240);
      const v1 = await view(page);
      check('2', v1.s > Math.max(v0.s, 1.2) && v1.s <= 4.001, tag + ' pinch out ' + v0.s + '->' + v1.s);
      await pinch(page, cdp, cx, cy, 240, 80);
      const v2 = await view(page);
      check('2', v2.s < v1.s, tag + ' pinch in');
      // buttons
      await page.tap('[data-z="reset"]'); await page.waitForTimeout(500);
      check('2', Math.abs((await view(page)).s - 1) < 0.01, tag + ' reset');
      await page.tap('[data-z="in"]'); await page.waitForTimeout(500);
      const b1 = (await view(page)).s; check('2', b1 > 1.4, tag + ' + button ' + b1);
      await page.tap('[data-z="in"]'); await page.tap('[data-z="in"]'); await page.waitForTimeout(500);
      await page.tap('[data-z="out"]'); await page.waitForTimeout(500);
      check('2', (await view(page)).s < 4 && (await view(page)).s > b1, tag + ' - button');
      for (let i = 0; i < 6; i++) if (await page.isEnabled('[data-z="in"]')) await page.tap('[data-z="in"]');
      await page.waitForTimeout(500);
      check('2', Math.abs((await view(page)).s - 4) < 0.01, tag + ' max 4x');
      // control sizes
      const sizes = await page.$$eval('.vctl button', (b) => b.map((x) => { const r = x.getBoundingClientRect(); return Math.min(r.width, r.height); }));
      check('2', sizes.every((s) => s >= 43.9), tag + ' control targets ' + sizes);
      // pan at 3x
      await page.tap('[data-z="reset"]'); await page.waitForTimeout(450);
      await page.tap('[data-z="in"]'); await page.tap('[data-z="in"]'); await page.tap('[data-z="in"]'); await page.waitForTimeout(500);
      const vp3 = await view(page); check('2', vp3.s > 3, tag + ' 3x scale ' + vp3.s);
      await touch(cdp, 'touchStart', [[cx, cy]]);
      for (let i = 1; i <= 6; i++) { await touch(cdp, 'touchMove', [[cx - i * 10, cy - i * 8]]); await page.waitForTimeout(16); }
      await touch(cdp, 'touchEnd', []);
      const vp4 = await view(page);
      check('2', Math.abs(vp4.tx - (vp3.tx - 60)) < 3 && Math.abs(vp4.ty - (vp3.ty - 48)) < 3, tag + ` pan ${JSON.stringify(vp3)} ${JSON.stringify(vp4)}`);
      // double tap
      await page.tap('[data-z="reset"]'); await page.waitForTimeout(450);
      await touch(cdp, 'touchStart', [[cx, cy]]); await touch(cdp, 'touchEnd', []);
      await page.waitForTimeout(80);
      await touch(cdp, 'touchStart', [[cx, cy]]); await touch(cdp, 'touchEnd', []);
      await page.waitForTimeout(500);
      check('2', Math.abs((await view(page)).s - 2) < 0.05, tag + ' double tap ' + (await view(page)).s);
      // box unchanged
      const r1 = await boxRect(page);
      check('2', Math.abs(r1.w - r0.w) < 0.5 && Math.abs(r1.h - r0.h) < 0.5, tag + ' box size changed');
      // row tap centres highlight at every zoom level
      for (const z of [0, 1, 2, 3]) {
        await page.tap('[data-z="reset"]'); await page.waitForTimeout(450);
        for (let i = 0; i < z; i++) { await page.tap('[data-z="in"]'); await page.waitForTimeout(80); }
        await page.waitForTimeout(450);
        const rowIdx = [0, 17, 23, 9][z];
        await page.evaluate((i) => document.querySelector(`.row[data-i="${i}"]`).scrollIntoView({ block: 'center' }), rowIdx);
        await page.waitForTimeout(150);
        await T(page, `.row[data-i="${rowIdx}"] .r1`); await page.waitForTimeout(700);
        const rb = await boxRect(page);
        const h = await hlCenter(page);
        const dx = h.cx - (rb.x + rb.w / 2), dy = h.cy - (rb.y + rb.h / 2);
        check('2', Math.abs(dx) < 3 && Math.abs(dy) < 3, tag + ` row ${rowIdx} z${z} off-centre ${dx.toFixed(1)},${dy.toFixed(1)}`);
        // fully inside box vertically
        check('2', h.t >= rb.y - 1 && h.b <= rb.y + rb.h + 1, tag + ` row ${rowIdx} cut vertically`);
        const s = (await view(page)).s; check('2', s >= 2.49, tag + ' row zoom ' + s);
        // alignment: highlight rect within doc image bounds and tall as one row (<= 5% of page height)
        const al = await page.evaluate(() => { const p = document.querySelector('#hl').getBoundingClientRect(); const i = document.querySelector('#vlayer img').getBoundingClientRect(); return { ok: p.left >= i.left - 1 && p.right <= i.right + 1 && p.top >= i.top - 1 && p.bottom <= i.bottom + 1, hr: p.height / i.height }; });
        check('2', al.ok && al.hr < 0.05, tag + ' highlight misaligned ' + JSON.stringify(al));
      }
      if (SHOTS && id === 'textil' && !photo && vn === 'ipad-landscape') { await T(page, '.row[data-i="17"] .r1'); await page.waitForTimeout(700); await shot(page, '1-review-zoomed'); }
      if (SHOTS && photo && vn === 'ipad-portrait') { await T(page, '.row[data-i="17"] .r1'); await page.waitForTimeout(700); await shot(page, '1b-photo-row18'); }
      // page itself still scrolls when dragging outside viewer
      const y0 = await page.evaluate(() => scrollY);
      await page.evaluate(() => window.scrollBy(0, 300)); check('2', (await page.evaluate(() => scrollY)) > y0, tag + ' page scroll');
      // pinch must not zoom the page (visual viewport scale)
      const vv = await page.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1); check('2', vv === 1, tag + ' page zoomed ' + vv);
      const ta = await page.$eval('#vbox', (b) => getComputedStyle(b).touchAction); check('2', ta === 'none', tag + ' touch-action ' + ta);
      const ta2 = await page.$eval('#rows', (b) => getComputedStyle(b).touchAction); check('2', ta2 === 'auto', tag + ' rows touch-action ' + ta2);
    } catch (e) { fail('2', tag + ' EXC ' + (e.message.split('\n')[0] + ' @' + (e.stack.split('\n').find((l) => l.includes('test.cjs')) || '').trim())); }
    await c.close();
  }
  // desktop: ctrl+wheel, wheel pan, mouse drag, dblclick
  {
    const c = await br.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }); const page = await c.newPage();
    try {
      await open(page, 'ski', false);
      const r = await boxRect(page); const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      await page.mouse.move(cx, cy);
      await page.click('[data-z="reset"]');
      await page.waitForTimeout(450);
      const s0 = (await view(page)).s;
      await page.keyboard.down('Control'); await page.mouse.move(cx, cy); await page.mouse.wheel(0, -300); await page.keyboard.up('Control');
      await page.waitForTimeout(100);
      const s1 = (await view(page)).s; check('2', s1 > s0 + 0.5, 'desktop ctrl+wheel ' + s0 + '->' + s1);
      const v1 = await view(page);
      await page.mouse.wheel(0, 120); await page.waitForTimeout(100);
      const v2 = await view(page); check('2', v2.ty < v1.ty, 'desktop wheel pan');
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 40, cy + 30, { steps: 5 }); await page.mouse.up();
      const v3 = await view(page); check('2', v3.tx !== v2.tx || v3.ty !== v2.ty, 'desktop mouse drag ' + JSON.stringify([v2, v3]));
      await page.click('[data-z="reset"]'); await page.waitForTimeout(450);
      await page.mouse.dblclick(cx, cy); await page.waitForTimeout(500);
      check('2', Math.abs((await view(page)).s - 2) < 0.05, 'desktop dblclick ' + (await view(page)).s);
      // landscape/desktop: side by side
      const rows = await page.$eval('.split', (s) => getComputedStyle(s).display); check('2', rows === 'grid', 'desktop split ' + rows);
    } catch (e) { fail('2', 'desktop EXC ' + (e.message.split('\n')[0] + ' @' + (e.stack.split('\n').find((l) => l.includes('test.cjs')) || '').trim())); }
    await c.close();
  }

  // ---- 3 exports ----
  const csvOut = [];
  for (const id of IDS) {
    const c = await ctx([1024, 768]); const page = await c.newPage();
    try {
      await open(page, id, false);
      const ex = DATA.find((e) => e.id === id);
      await confirm(page, id === 'ebike' ? 1 : 1);
      await page.tap('#toexport'); await page.waitForSelector('.fmt');
      const docText = new Set();
      ex.lines.forEach((l) => { [l.artnr, l.ean, l.name, l.brand, l.color, l.size, String(l.qty), (l.ek / 100).toFixed(2), l.frame, l.battery].forEach((v) => v && docText.add(v)); });
      docText.add(ex.supplier);
      const fixes = { ski: ['26.5'], textil: ['M'], ebike: ['TS26-0041882'] }[id]; fixes.forEach((v) => docText.add(v));
      for (const f of ['csv', 'lightspeed', 'advarics']) {
        await page.tap(`[data-f="${f}"]`); await page.waitForTimeout(100);
        const prev = await page.textContent('.prev');
        check('3', !/Saison|Winter 2026|Sommer 2027/.test(prev), `${id}/${f} saison in preview`);
        const note = await page.textContent('.note');
        if (f === 'lightspeed') check('3', note.includes('Vollständige Lightspeed-OnSite-Vorlage, nur die Spalten aus dem Lieferschein sind ausgefüllt'), 'ls note');
        if (f === 'advarics') check('3', note.includes('Das genaue Advarics-Format kläre ich mit Ihnen ab') && note.includes('Beispielformat'), 'adv note');
        const [dl] = await Promise.all([page.waitForEvent('download'), page.tap('#make')]);
        const buf = fs.readFileSync(await dl.path()); const name = dl.suggestedFilename();
        const txt = buf.toString('utf8');
        csvOut.push(`${id}/${f} ${name} ${buf.length}B`);
        check('3', !/Saison|Winter 2026|Sommer 2027|season/i.test(txt), `${id}/${f} saison in file`);
        if (f === 'lightspeed') {
          check('3', name.endsWith('.txt'), 'ls ext');
          check('3', buf[0] !== 0xef, 'ls BOM');
          const rows = txt.split('\r'); check('3', rows[rows.length - 1] === '', 'ls trailing');
          rows.pop();
          check('3', rows[0] === tpl, 'ls header differs from template');
          const H = tpl.split('\t'); check('3', H.length === 114, 'ls header cols');
          const filled = ['Product Code', 'Description', 'Family', 'UPC', 'Supplier', 'Supplier Code', 'Cost', 'Color', 'Size', 'Inventory Quantity', 'Current', 'Inventoried'];
          check('3', rows.length === ex.lines.length + 1, 'ls rows ' + rows.length);
          rows.slice(1).forEach((r, ri) => {
            const cells = r.split('\t'); check('3', cells.length === 114, `ls ${id} row ${ri} cols ${cells.length}`);
            cells.forEach((v, i) => {
              if (!v) return;
              if (!filled.includes(H[i])) fail('3', `${id} ls unexpected column ${H[i]}=${v}`);
              else if (!(docText.has(v) || v === 'Y')) fail('3', `${id} ls value not in document: ${H[i]}=${v}`);
            });
            filled.forEach((k) => { if (!cells[H.indexOf(k)]) fail('3', `${id} ls empty ${k} row ${ri}`); });
            check('3', cells[H.indexOf('Sell')] === '' && cells[H.indexOf('Current')] === 'Y' && cells[H.indexOf('Inventoried')] === 'Y', 'ls sell/current');
            check('3', cells[H.indexOf('Product Code')] === cells[H.indexOf('Supplier Code')], 'ls codes');
          });
          const pth = await page.$$eval('.prev th', (t) => t.map((x) => x.textContent)); check('3', pth.join('|') === ['Product Code', 'Description', 'Family', 'UPC', 'Supplier', 'Supplier Code', 'Cost', 'Color', 'Size', 'Current', 'Inventoried', 'Inventory Quantity'].join('|'), 'ls preview cols ' + pth.join('|'));
        } else {
          const rows = txt.replace(/^﻿/, '').trim().split('\r\n').map((r) => r.split(';'));
          rows.slice(1).forEach((cells, ri) => cells.forEach((v) => { if (v && !docText.has(v) && !/^\d+$/.test(v) && !/^\d+\.\d\d$/.test(v)) fail('3', `${id}/${f} value not in doc: ${v}`); }));
          if (f === 'advarics') { check('3', rows[0].includes('VK') && rows.slice(1).every((r) => r[rows[0].indexOf('VK')] === ''), 'VK empty'); check('3', rows[0].includes('Lieferant') && rows[0].includes('Grösse'), 'adv german'); }
          if (id === 'ebike') check('3', txt.includes('TS26-0041882') && !txt.includes('TS26-O041882'), `${id}/${f} frame fix`);
        }
      }
    } catch (e) { fail('3', id + ' EXC ' + (e.message.split('\n')[0] + ' @' + (e.stack.split('\n').find((l) => l.includes('test.cjs')) || '').trim())); }
    await c.close();
  }
  // "wie gelesen" keeps raw value
  {
    const c = await ctx([1024, 768]); const page = await c.newPage();
    await open(page, 'ebike', false); await confirm(page, 2);
    check('3', (await page.textContent('.row.done')).includes('TS26-O041882'), 'as-read kept');
    await c.close();
  }
  // ---- 4 favicon / brand ----
  {
    const c = await ctx([1024, 768]); const page = await c.newPage();
    await page.goto(BASE);
    const links = await page.$$eval('link[rel*=icon]', (l) => l.map((x) => x.href));
    check('4', links.length >= 3, 'icon links ' + links.join(','));
    for (const l of links) { const r = await page.request.get(l); check('4', r.status() === 200 && /image/.test(r.headers()['content-type'] || ''), 'icon ' + l + ' ' + r.status()); }
    const wm = await page.$eval('.brand', (a) => ({ t: a.textContent, h: a.href, tg: a.target }));
    check('4', wm.t === 'krattid_' && wm.h === 'https://www.krattid.com/', 'wordmark ' + JSON.stringify(wm));
    const ab = await page.$eval('.about', (a) => ({ t: a.textContent, h: a.href, tg: a.target }));
    check('4', ab.t === 'Über mich' && ab.tg === '_blank' && ab.h === 'https://www.krattid.com/', 'about ' + JSON.stringify(ab));
    const rb = await page.request.get(BASE + 'robots.txt'); check('4', /Disallow: \//.test(await rb.text()), 'robots');
    check('4', (await page.$('meta[name=robots][content*=noindex]')) !== null, 'noindex meta');
    const pimg = await page.request.get(BASE + 'brand/peeter.jpg'); check('4', pimg.status() === 200 && (await pimg.body()).length < 200 * 1024, 'portrait size');
    for (const id of ['ski', 'textil', 'ebike']) { const r = await page.request.get(BASE + `docs/${id}.jpg`); check('4', (await r.body()).length < 1.5e6, id + ' img size'); }
    const rf = await page.request.get(BASE + 'docs/textil-foto.jpg'); check('4', (await rf.body()).length < 1.5e6, 'foto size');
    const pdf = await page.request.get(BASE + 'docs/lieferschein-ski.pdf'); check('4', !(pdf.status() === 200 && /pdf/.test(pdf.headers()['content-type'] || '')), 'pdf still served');
    await c.close();
  }
  await br.close();
  console.log(JSON.stringify(csvOut, null, 1));
  const keys = ['1', '2', '3', '4'];
  let bad = 0;
  for (const k of keys) { const f = res[k] || []; console.log(`TEST ${k}: ${f.length ? 'FAIL (' + f.length + ')' : 'PASS'}`); f.slice(0, 25).forEach((m) => console.log('   - ' + m)); bad += f.length; }
  process.exit(bad ? 1 : 0);
})();
