// Generates fictional supplier documents (HTML -> PDF + JPEG + positions) and src/data/examples.json
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'docs');

// ---------- EAN ----------
let seed = 20261027;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
function ean(prefix) {
  let d = String(prefix);
  while (d.length < 12) d += Math.floor(rnd() * 10);
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(d[i]) * (i % 2 ? 3 : 1);
  return d + ((10 - (s % 10)) % 10);
}
const chf = (c) => (c / 100).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/’|'/g, '’');

// ---------- Data ----------
const customer = ['Muster Sport AG', 'Dorfstrasse 1', '8000 Musterhausen'];
const ex = [];

// 1 Ski
{
  const L = [];
  const add = (art, name, color, size, qty, ek) => L.push({ artnr: art, ean: ean(21), name, color, size, qty, ek });
  add('FW-AM88-165', 'Firnwerk Allmountain 88 Ti', 'Anthrazit', '165 cm', 2, 32900);
  add('FW-AM88-172', 'Firnwerk Allmountain 88 Ti', 'Anthrazit', '172 cm', 3, 32900);
  add('FW-AM88-179', 'Firnwerk Allmountain 88 Ti', 'Anthrazit', '179 cm', 2, 32900);
  add('FW-PC74-160', 'Firnwerk Piste Carver 74', 'Eisblau', '160 cm', 2, 24950);
  add('FW-PC74-168', 'Firnwerk Piste Carver 74', 'Eisblau', '168 cm', 2, 24950);
  add('GR-FW11-90', 'Gripp Bindung FW 11 GW', 'Schwarz', '90 mm', 4, 8900);
  add('GR-FW11-100', 'Gripp Bindung FW 11 GW', 'Schwarz', '100 mm', 3, 8900);
  add('FB-T100-255', 'Firnwerk Tour Boot Pro 100', 'Schwarz/Lime', '25.5', 2, 29500);
  add('FB-T100-265', 'Firnwerk Tour Boot Pro 100', 'Schwarz/Lime', '26.5', 3, 29500);
  add('FB-A90-265', 'Firnwerk Allround Boot 90', 'Graphit', '26.5/27', 2, 21500);
  add('FB-T100-275', 'Firnwerk Tour Boot Pro 100', 'Schwarz/Lime', '27.5', 2, 29500);
  add('FB-T100-295', 'Firnwerk Tour Boot Pro 100', 'Schwarz/Lime', '29.5', 1, 29500);
  ex.push({
    id: 'ski', card: 'Ski und Bindungen', supplier: 'Firnwerk Sportvertrieb AG', addr: ['Industriestrasse 14', '6340 Baar'],
    kind: 'Lieferschein', nr: 'LS-2026-04417', kdnr: '40218', ref: 'B-2026-118 vom 02.09.2026', refLabel: 'Ihre Bestellung',
    mwst: 'CHE-112.358.132 MWST', pay: 'Zahlbar innert 30 Tagen netto. Ware bleibt bis zur vollständigen Bezahlung Eigentum des Lieferanten.',
    season: 'Winter 2026/27', lines: L, flag: { index: 9, field: 'size', raw: '26.5/27', suggestions: ['26.5', '27'] },
  });
}
// 2 Textil
{
  const L = [];
  const sizes = ['S', 'M', 'L', 'XL'];
  const jackets = [
    ['BF', 'Jacke Bergföhn', 18900, [['010', 'Schwarz'], ['450', 'Tannengrün'], ['620', 'Beerenrot']]],
    ['NG', 'Softshell Nebelgrat', 14500, [['010', 'Schwarz'], ['380', 'Nachtblau'], ['740', 'Senfgelb']]],
  ];
  let fi = -1;
  for (const [p, name, ek, cols] of jackets) for (const [cc, cn] of cols) for (const s of sizes) {
    const q = s === 'S' || s === 'XL' ? 1 : 2;
    const size = p === 'NG' && cc === '380' && s === 'M' ? 'M/L' : s;
    if (size === 'M/L') fi = L.length;
    L.push({ artnr: `${p}-${cc}-${s}`, ean: ean(22), name, color: `${cc} ${cn}`, size, qty: q, ek });
  }
  ex.push({
    id: 'textil', card: 'Bekleidung mit Grössen', supplier: 'Bergflanke Textil GmbH', addr: ['Seestrasse 102', '8806 Bäch'],
    kind: 'Auftragsbestätigung', nr: 'AB-26-10382', kdnr: '31507', ref: 'B-2026-121 vom 09.09.2026', refLabel: 'Ihre Bestellung',
    extra: 'Voraussichtlicher Liefertermin: KW 45/2026', mwst: 'CHE-224.466.881 MWST',
    pay: 'Zahlbar innert 30 Tagen netto, 2 % Skonto innert 10 Tagen. Preise netto in CHF, exkl. MWST.',
    season: 'Winter 2026/27', lines: L, flag: { index: fi, field: 'size', raw: 'M/L', suggestions: ['M', 'L'] },
  });
}
// 3 E-Bikes
{
  const L = [];
  const b = [
    ['TS-ALP750-M', 'Talstrom Alpin 750', 'Matt Schiefer', 'M', 'TS26-0041873', 'BAT26-5528101', 289000],
    ['TS-ALP750-L', 'Talstrom Alpin 750', 'Matt Schiefer', 'L', 'TS26-0041874', 'BAT26-5528102', 289000],
    ['TS-CTY500-S', 'Talstrom City 500', 'Perlweiss', 'S', 'TS26-0041877', 'BAT26-5528119', 199000],
    ['TS-CTY500-M', 'Talstrom City 500', 'Perlweiss', 'M', 'TS26-0041878', 'BAT26-5528120', 199000],
    ['TS-TRL900-M', 'Talstrom Trail EX 900', 'Tannengrün', 'M', 'TS26-0041881', 'BAT26-5528133', 429000],
    ['TS-TRL900-L', 'Talstrom Trail EX 900', 'Tannengrün', 'L', 'TS26-O041882', 'BAT26-5528134', 429000],
  ];
  for (const [a, n, c, s, f, bat, ek] of b) L.push({ artnr: a, ean: ean(23), name: n, color: c, size: s, qty: 1, ek, frame: f, battery: bat });
  ex.push({
    id: 'ebike', card: 'E-Bikes mit Rahmennummern', supplier: 'Talstrom E-Bikes AG', addr: ['Werkstrasse 8', '3360 Herzogenbuchsee'],
    kind: 'Lieferschein', nr: 'LS-26-007291', kdnr: '70934', ref: 'B-2026-125 vom 15.09.2026', refLabel: 'Ihre Bestellung',
    mwst: 'CHE-337.559.204 MWST', pay: 'Zahlbar innert 20 Tagen netto. Rahmen- und Akkunummern bitte bei Wareneingang kontrollieren.',
    season: 'Sommer 2027', lines: L, flag: { index: 5, field: 'frame', raw: 'TS26-O041882', suggestions: ['TS26-0041882'] },
  });
}
for (const e of ex) {
  e.netC = e.lines.reduce((s, l) => s + l.qty * l.ek, 0);
  e.mwstC = Math.round(e.netC * 0.081);
  e.grossC = e.netC + e.mwstC;
  e.net = e.netC / 100;
}

// ---------- HTML ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
function docHtml(e, photo) {
  const eb = e.id === 'ebike';
  const rows = e.lines.map((l, i) => {
    const smudge = photo && i === e.flag.index && e.id === 'textil' ? '<i class="smudge"></i>' : '';
    return `<tr data-i="${i}"><td data-f="pos">${i + 1}</td><td data-f="artnr" class="m">${esc(l.artnr)}</td><td data-f="ean" class="m">${l.ean}</td>
<td data-f="name">${esc(l.name)}${eb ? `<div class="sub">Rahmen-Nr. <span data-f="frame">${l.frame}</span> · Akku <span data-f="battery">${l.battery}</span></div>` : ''}</td>
<td data-f="color">${esc(l.color)}</td><td data-f="size" class="c rel">${esc(l.size)}${smudge}</td><td data-f="qty" class="r">${l.qty}</td><td data-f="ek" class="r">${chf(l.ek)}</td><td data-f="total" class="r">${chf(l.ek * l.qty)}</td></tr>`;
  }).join('');
  return `<div class="sheet" id="sheet"><style>
.sheet{width:794px;height:1123px;background:#fff;color:#1a1a1a;font:11px/1.35 Helvetica,Arial,sans-serif;padding:44px 40px;box-sizing:border-box;position:relative}
.sheet *{box-sizing:border-box}
.hd{display:flex;justify-content:space-between;align-items:flex-start}
.sup b{font-size:18px;letter-spacing:.2px}.sup div{color:#444}
.meta{margin-top:26px;display:flex;justify-content:space-between}
.cust{font-size:12px;line-height:1.5}.cust small{display:block;color:#666;font-size:8.5px;text-decoration:underline;margin-bottom:4px}
.kv{border-collapse:collapse}.kv td{padding:1.5px 0 1.5px 14px}.kv td:first-child{color:#555;padding-left:0}
h1{font-size:20px;margin:26px 0 10px}
table.p{width:100%;border-collapse:collapse}
.p th{text-align:left;font-size:9.5px;color:#444;border-top:1.5px solid #222;border-bottom:1px solid #222;padding:4px 4px}
.p td:nth-child(5),.p td:nth-child(2),.p td:nth-child(3){white-space:nowrap}.p td{padding:${eb ? 5 : 3.5}px 4px;border-bottom:1px solid #ddd;vertical-align:top}
.p .m{font-family:"Courier New",monospace;font-size:10px}.r{text-align:right}.c{text-align:center}.rel{position:relative}
.sub{font-size:9.5px;color:#444;font-family:"Courier New",monospace;margin-top:1px}
.tot{margin:12px 0 0 auto;width:250px;border-collapse:collapse}.tot td{padding:2.5px 4px}.tot td:last-child{text-align:right}.tot tr:last-child td{border-top:1.5px solid #222;font-weight:bold;font-size:12px}
.ft{position:absolute;left:40px;right:40px;bottom:36px;border-top:1px solid #999;padding-top:7px;color:#444;font-size:9.5px;display:flex;justify-content:space-between;gap:20px}
.smudge{position:absolute;left:-6px;top:-5px;width:44px;height:30px;background:radial-gradient(ellipse,rgba(70,45,20,.42),rgba(70,45,20,0) 70%);filter:blur(1.5px)}
</style>
<div class="hd"><div class="sup"><b>${esc(e.supplier)}</b><div>${e.addr.join(', ')}</div><div>Schweiz</div></div><div style="text-align:right;color:#444">${e.id === 'ski' ? 'www.firnwerk.example' : e.id === 'textil' ? 'www.bergflanke.example' : 'www.talstrom.example'}<br>Tel. +41 00 000 00 00</div></div>
<div class="meta"><div class="cust"><small>${esc(e.supplier)} · ${e.addr.join(' · ')}</small>${customer.map(esc).join('<br>')}</div>
<table class="kv"><tr><td>${e.kind}-Nr.</td><td><b>${e.nr}</b></td></tr><tr><td>Datum</td><td>27.10.2026</td></tr><tr><td>Kunden-Nr.</td><td>${e.kdnr}</td></tr><tr><td>${e.refLabel}</td><td>${e.ref}</td></tr><tr><td>Auftrags-Nr.</td><td>AU-${e.kdnr}-${e.nr.slice(-3)}</td></tr></table></div>
<h1>${e.kind}</h1>
<table class="p"><thead><tr><th style="width:28px">Pos.</th><th style="width:92px">Art.-Nr.</th><th style="width:104px">EAN</th><th>Bezeichnung</th><th style="width:92px">Farbe</th><th style="width:54px" class="c">Grösse/Länge</th><th style="width:38px" class="r">Menge</th><th style="width:62px" class="r">EK netto CHF</th><th style="width:66px" class="r">Total</th></tr></thead><tbody>${rows}</tbody></table>
<table class="tot"><tr><td>Warenwert netto</td><td>CHF ${chf(e.netC)}</td></tr><tr><td>MWST 8.1 %</td><td>CHF ${chf(e.mwstC)}</td></tr><tr><td>Total CHF</td><td>${chf(e.grossC)}</td></tr></table>
${e.extra ? `<p style="margin-top:14px">${e.extra}</p>` : ''}
<div class="ft"><div>${esc(e.supplier)} · ${e.addr.join(', ')}<br>${e.mwst}</div><div style="max-width:380px;text-align:right">${esc(e.pay)}</div></div></div>`;
}

const photoWrap = (inner) => `<body style="margin:0;width:1000px;height:1320px;overflow:hidden;background:radial-gradient(ellipse at 30% 20%,#8a6f55,#5b4634 70%);position:relative">
<div id="tilt" style="position:absolute;left:78px;top:92px;width:794px;height:1123px;transform-origin:50% 50%;transform:perspective(1600px) rotateX(2.5deg) rotateY(-2deg) rotate(-2deg);box-shadow:0 30px 60px rgba(0,0,0,.45),0 4px 10px rgba(0,0,0,.35);filter:sepia(.14) brightness(.97) contrast(.96)">${inner}
<div style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(115deg,rgba(255,236,190,.28),rgba(255,236,190,0) 35%,rgba(60,40,20,.14) 100%)"></div></div></body>`;

(async () => {
  const br = await chromium.launch();
  const positions = {};
  for (const e of ex) {
    const page = await br.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><body style="margin:0">${docHtml(e, false)}</body>`);
    const grab = () => page.evaluate(() => {
      const base = document.getElementById('tilt') ? { x: 0, y: 0 } : { x: 0, y: 0 };
      return [...document.querySelectorAll('tbody tr')].map((tr) => {
        const r = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
        const cells = {};
        tr.querySelectorAll('[data-f]').forEach((c) => { cells[c.dataset.f] = r(c); });
        return { row: r(tr), cells };
      });
    });
    const rel = (rows, W, H) => rows.map((o) => {
      const f = (a) => ({ x: +(a[0] / W).toFixed(4), y: +(a[1] / H).toFixed(4), w: +(a[2] / W).toFixed(4), h: +(a[3] / H).toFixed(4) });
      const cells = {}; for (const k in o.cells) cells[k] = f(o.cells[k]);
      return { ...f(o.row), cells };
    });
    const rows = await grab();
    positions[e.id] = { pdf: { w: 794, h: 1123, rows: rel(rows, 794, 1123) } };
    await page.screenshot({ path: path.join(out, e.id + '.jpg'), type: 'jpeg', quality: 70 });
    await page.pdf({ path: path.join(out, `lieferschein-${e.id}.pdf`), width: '794px', height: '1123px', printBackground: true });
    if (e.id === 'textil') {
      const p2 = await br.newPage({ viewport: { width: 1000, height: 1320 }, deviceScaleFactor: 1.5 });
      await p2.setContent("<!doctype html>"+photoWrap(docHtml(e, true)));
      const r2 = await p2.evaluate(() => [...document.querySelectorAll('tbody tr')].map((tr) => {
        const r = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
        const cells = {}; tr.querySelectorAll('[data-f]').forEach((c) => { cells[c.dataset.f] = r(c); });
        return { row: r(tr), cells };
      }));
      positions[e.id].photo = { w: 1000, h: 1320, rows: rel(r2, 1000, 1320) };
      await p2.screenshot({ path: path.join(out, e.id + '-foto.jpg'), type: 'jpeg', quality: 68 });
    }
  }
  await br.close();
  fs.writeFileSync(path.join(out, 'positions.json'), JSON.stringify(positions));
  const data = ex.map((e) => ({
    id: e.id, card: e.card, supplier: e.supplier, kind: e.kind, nr: e.nr, season: e.season, lines: e.lines, flag: e.flag,
    net: e.net, files: { img: `docs/${e.id}.jpg`, photo: e.id === 'textil' ? 'docs/textil-foto.jpg' : null, pdf: `docs/lieferschein-${e.id}.pdf` },
  }));
  fs.writeFileSync(path.join(root, 'src/data/examples.json'), JSON.stringify(data));
  console.log('ok', data.map((d) => d.id + ':' + d.lines.length).join(' '));
})();
