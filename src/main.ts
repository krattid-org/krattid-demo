import './style.css';
import data from './data/examples.json';

interface Line { artnr: string; ean: string; name: string; color: string; size: string; qty: number; ek: number; frame?: string; battery?: string }
interface Flag { index: number; field: 'size' | 'frame'; raw: string; suggestions: string[] }
interface Ex { id: string; card: string; supplier: string; kind: string; nr: string; season: string; lines: Line[]; flag: Flag; net: number; files: { img: string; photo: string | null; pdf: string } }
interface Box { x: number; y: number; w: number; h: number }
interface Pos { w: number; h: number; rows: Box[] }

const EX = data as Ex[];
const app = document.getElementById('app') as HTMLElement;
const backBtn = document.getElementById('back') as HTMLButtonElement;
let positions: Record<string, { pdf: Pos; photo?: Pos }> | null = null;
let cur: Ex | null = null;
let lines: Line[] = [];
let confirmed = false;
let usePhoto = false;
let selected = -1;
let fmt = 'advarics';
let timer = 0;

const esc = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const money = (c: number) => (c / 100).toFixed(2);
const eanOk = (e: string) => {
  if (!/^\d{13}$/.test(e)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(e[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === Number(e[12]);
};

function loadPositions(): Promise<void> {
  if (positions) return Promise.resolve();
  return fetch('docs/positions.json').then((r) => r.json()).then((j) => { positions = j; }).catch(() => { positions = {} as never; });
}

function reset() {
  window.clearTimeout(timer);
  cur = null; confirmed = false; selected = -1; usePhoto = false; fmt = 'advarics';
  lines = [];
}

function start() {
  reset();
  backBtn.hidden = true;
  window.scrollTo(0, 0);
  app.innerHTML = `<span class="label">Beispiel mit fiktivem Lieferanten</span>
<h1>So kommt ein Lieferschein in Ihr System</h1>
<p>Wählen Sie ein Beispiel. Aus dem Dokument wird eine geprüfte Importdatei für Ihr Kassen- und Warenwirtschaftssystem.</p>
<div class="cards">${EX.map((e) => `<div class="cardbox"><button type="button" class="card" data-id="${e.id}"><b>${esc(e.card)}</b><span>${esc(e.supplier)}</span><span>${e.lines.length} Positionen</span><span class="go">Beispiel öffnen →</span></button>${e.files.photo ? '<label class="toggle"><input type="checkbox" id="photo"> Foto statt PDF</label>' : ''}</div>`).join('')}</div>`;
  app.querySelectorAll<HTMLButtonElement>('.card').forEach((b) => b.addEventListener('click', () => {
    const ex = EX.filter((e) => e.id === b.dataset.id)[0];
    const ph = document.getElementById('photo') as HTMLInputElement | null;
    reading(ex, !!(ph && ph.checked && ex.files.photo));
  }));
}

function reading(ex: Ex, photo: boolean) {
  reset();
  cur = ex; usePhoto = photo;
  lines = JSON.parse(JSON.stringify(ex.lines));
  backBtn.hidden = false;
  window.scrollTo(0, 0);
  app.innerHTML = `<div class="reading" role="status"><h1>Lieferschein wird gelesen …</h1><div class="bar"><i></i></div></div>`;
  const p = loadPositions();
  timer = window.setTimeout(() => { p.then(check); }, 1000);
}

function rowHtml(l: Line, i: number) {
  const f = cur!.flag;
  const isFlag = i === f.index;
  const cls = 'row' + (isFlag ? (confirmed ? ' done' : ' flag') : '') + (i === selected ? ' sel' : '');
  const tag = isFlag ? (confirmed ? '<em>✓ geprüft</em>' : '<em>bitte prüfen</em>') : '';
  const frame = l.frame ? `<div><small>Rahmennummer</small><span class="mono">${esc(l.frame)}</span></div><div><small>Akku</small><span class="mono">${esc(l.battery || '')}</span></div>` : '';
  const editor = isFlag && !confirmed && i === selected ? editorHtml() : '';
  return `<div class="${cls}" data-i="${i}" role="button" tabindex="0"><div class="r1"><span>${i + 1}. ${esc(l.name)}</span>${tag}</div>
<div class="cells"><div><small>Art.-Nr.</small><span class="mono">${esc(l.artnr)}</span></div><div><small>EAN</small><span class="mono">${esc(l.ean)}</span></div><div><small>Farbe</small>${esc(l.color)}</div><div><small>Grösse/Länge</small>${esc(l.size)}</div><div><small>Menge</small>${l.qty}</div><div><small>EK CHF</small>${money(l.ek)}</div>${frame}</div>${editor}</div>`;
}

let choice = '';
function editorHtml() {
  const f = cur!.flag;
  if (!choice) choice = f.suggestions[0];
  const what = f.field === 'frame' ? 'Rahmennummer' : 'Grösse';
  return `<div class="editor"><p><b>${what}:</b> erkannt «${esc(f.raw)}». ${f.suggestions.length > 1 ? 'Welcher Wert stimmt?' : 'Vorschlag:'}</p>
<div class="opts">${f.suggestions.map((s) => `<button type="button" class="opt${s === choice ? ' on' : ''}" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>
<button type="button" class="btn" id="confirm">Übernehmen</button></div>`;
}

function chipsHtml() {
  const allEan = lines.every((l) => eanOk(l.ean));
  const sum = Math.round(lines.reduce((s, l) => s + l.qty * l.ek, 0));
  const sumOk = sum === Math.round(cur!.net * 100);
  return `${allEan ? '<span class="chip">EAN geprüft ✓</span>' : '<span class="chip warn">EAN prüfen</span>'}
${sumOk ? '<span class="chip">Summe stimmt mit Lieferschein ✓</span>' : '<span class="chip warn">Summe weicht ab</span>'}
${confirmed ? '<span class="chip" id="flagchip">Position geprüft ✓</span>' : '<span class="chip warn" id="flagchip">1 Position prüfen</span>'}`;
}

function check() {
  if (!cur) return;
  const ex = cur;
  const n = lines.length;
  const P = positions && positions[ex.id];
  const pos = P ? (usePhoto && P.photo ? P.photo : P.pdf) : null;
  const img = usePhoto && ex.files.photo ? ex.files.photo : ex.files.img;
  app.innerHTML = `<h1>Bitte kurz prüfen</h1>
<div class="chips" id="chips"></div><p class="summary" id="sum"></p>
<div class="split"><div class="docpane" id="docpane"><div class="dochead"><span><b>${esc(ex.supplier)}</b> · ${esc(ex.kind)}</span><span><a class="btn alt" href="${ex.files.pdf}" download>PDF öffnen</a> <button type="button" class="btn alt" id="collapse">Dokument ein-/ausblenden</button></span></div>
<div class="docscroll" id="docscroll"><div class="docwrap" id="docwrap"><img src="${img}" alt="${esc(ex.kind)} von ${esc(ex.supplier)}"><div class="hl" id="hl"></div></div></div></div>
<div><div class="rows" id="rows"></div></div></div>
<div class="bottom"><button type="button" class="btn" id="toexport">Weiter zum Export</button></div>`;
  const renderRows = () => {
    (document.getElementById('rows') as HTMLElement).innerHTML = lines.map(rowHtml).join('');
    (document.getElementById('chips') as HTMLElement).innerHTML = chipsHtml();
    (document.getElementById('sum') as HTMLElement).textContent = `${n} Positionen · ${n - 1} automatisch erkannt · ${confirmed ? 1 : 0} geprüft`;
  };
  const highlight = (i: number) => {
    const hl = document.getElementById('hl') as HTMLElement;
    const pane = document.getElementById('docpane') as HTMLElement;
    const sc = document.getElementById('docscroll') as HTMLElement;
    const wrap = document.getElementById('docwrap') as HTMLElement;
    if (!pos || !pos.rows[i]) return;
    const b = pos.rows[i];
    pane.classList.remove('collapsed');
    hl.style.display = 'block';
    hl.style.left = (b.x * 100) + '%'; hl.style.top = (b.y * 100) + '%';
    hl.style.width = (b.w * 100) + '%'; hl.style.height = (b.h * 100) + '%';
    hl.setAttribute('data-row', String(i));
    const target = wrap.offsetHeight * (b.y + b.h / 2) - sc.clientHeight / 2;
    if (sc.scrollTo) sc.scrollTo({ top: Math.max(0, target), behavior: 'smooth' }); else sc.scrollTop = Math.max(0, target);
  };
  renderRows();
  (document.getElementById('collapse') as HTMLElement).addEventListener('click', () => (document.getElementById('docpane') as HTMLElement).classList.toggle('collapsed'));
  (document.getElementById('toexport') as HTMLElement).addEventListener('click', exportScreen);
  const rowsEl = document.getElementById('rows') as HTMLElement;
  rowsEl.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    const opt = t.closest('.opt') as HTMLElement | null;
    if (opt) { choice = opt.dataset.v || ''; renderRows(); return; }
    if (t.closest('#confirm')) {
      const f = ex.flag; const l = lines[f.index];
      if (f.field === 'frame') l.frame = choice; else l.size = choice;
      confirmed = true; choice = '';
      renderRows();
      return;
    }
    if (t.closest('.editor')) return;
    const row = t.closest('.row') as HTMLElement | null;
    if (!row) return;
    selected = Number(row.dataset.i);
    renderRows();
    highlight(selected);
  });
}

// ---------- Export ----------
function q(v: string | number) {
  const s = String(v);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
const slug = (s: string) => s.toLowerCase().replace(/ö/g, 'oe').replace(/ä/g, 'ae').replace(/ü/g, 'ue').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function table(kind: string): string[][] {
  const ex = cur!;
  const eb = ex.id === 'ebike';
  if (kind === 'advarics') {
    const h = ['Lieferant', 'Art.-Nr.', 'EAN', 'Bezeichnung', 'Farbe', 'Grösse', 'Menge', 'EK', 'VK', 'Saison'].concat(eb ? ['Rahmennummer', 'Akku-Nr.'] : []);
    return [h].concat(lines.map((l) => [ex.supplier, l.artnr, l.ean, l.name, l.color, l.size, String(l.qty), money(l.ek), '', ex.season].concat(eb ? [l.frame || '', l.battery || ''] : [])));
  }
  if (kind === 'lightspeed') {
    const h = ['handle', 'sku', 'name', 'variant_option_one_name', 'variant_option_one_value', 'variant_option_two_name', 'variant_option_two_value', 'supply_price', 'retail_price', 'supplier_name', 'supplier_code', 'barcode', 'inventory_qty', 'season'].concat(eb ? ['serial_number', 'battery_serial'] : []);
    return [h].concat(lines.map((l) => [slug(l.name), l.artnr, l.name, 'Farbe', l.color, 'Grösse', l.size, money(l.ek), '', ex.supplier, l.artnr, l.ean, String(l.qty), ex.season].concat(eb ? [l.frame || '', l.battery || ''] : [])));
  }
  const h = ['Pos.', 'Art.-Nr.', 'EAN', 'Bezeichnung', 'Farbe', 'Grösse', 'Menge', 'EK netto CHF', 'Total CHF'].concat(eb ? ['Rahmennummer', 'Akku-Nr.'] : []);
  return [h].concat(lines.map((l, i) => [String(i + 1), l.artnr, l.ean, l.name, l.color, l.size, String(l.qty), money(l.ek), money(l.ek * l.qty)].concat(eb ? [l.frame || '', l.battery || ''] : [])));
}
function csv(kind: string) {
  return '﻿' + table(kind).map((r) => r.map(q).join(';')).join('\r\n') + '\r\n';
}

function exportScreen() {
  if (!cur) return;
  window.scrollTo(0, 0);
  const names: Record<string, string> = { advarics: 'Advarics (Beispielformat)', lightspeed: 'Lightspeed (Beispielformat)', csv: 'Excel / CSV' };
  const draw = (done: string) => {
    const t = table(fmt).slice(0, 6);
    app.innerHTML = `<h1>Importdatei</h1>
<p>${lines.length} Positionen von ${esc(cur!.supplier)}. Wählen Sie das Format Ihres Systems.</p>
<div class="fmt">${Object.keys(names).map((k) => `<button type="button" class="btn${k === fmt ? ' on' : ''}" data-f="${k}">${names[k]}</button>`).join('')}</div>
<p class="note">Vorschau: die ersten 5 Zeilen${fmt !== 'csv' ? ' · Beispielformat, nicht das Originalformat des Systems' : ''}</p>
<div class="prev"><table><thead><tr>${t[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<div class="bottom"><button type="button" class="btn" id="make" ${confirmed ? '' : 'disabled'}>Importdatei erstellen</button>
${confirmed ? '' : '<span class="note">Bitte zuerst die markierte Position prüfen. <a href="#" id="tocheck">Zurück zur Prüfung</a></span>'}
${done ? `<span class="ok" id="done">✓ ${esc(done)} erstellt</span>` : ''}
<button type="button" class="btn alt" id="tonext">Weiter</button></div>`;
    app.querySelectorAll<HTMLButtonElement>('.fmt .btn').forEach((b) => b.addEventListener('click', () => { fmt = b.dataset.f || 'advarics'; draw(''); }));
    const mk = document.getElementById('make') as HTMLButtonElement;
    mk.addEventListener('click', () => {
      if (!confirmed) return;
      const name = `${fmt}-beispiel-${cur!.id}.csv`;
      const blob = new Blob([csv(fmt)], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      window.setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      draw(name);
    });
    const tc = document.getElementById('tocheck');
    if (tc) tc.addEventListener('click', (e) => { e.preventDefault(); check(); });
    (document.getElementById('tonext') as HTMLElement).addEventListener('click', next);
  };
  draw('');
}

function next() {
  window.scrollTo(0, 0);
  app.innerHTML = `<div class="next"><h1>Mit Ihren eigenen Lieferscheinen testen</h1>
<p class="offer">Testlauf: bis zu 20 Lieferscheine dieser Saison, innert 24 Stunden importfertig. CHF 290, voll angerechnet, wenn Sie weitermachen.</p>
<div class="btns"><a class="btn" href="tel:+41798940009">Anrufen</a><a class="btn" href="mailto:peeter.mauring@krattid.com?subject=Testlauf%20Lieferscheine">E-Mail</a><a class="btn alt" href="https://krattid.com" target="_blank" rel="noopener">krattid.com</a></div></div>
<footer>Mauring Digital Solutions · Peeter Mauring · Neschwil</footer>`;
}

backBtn.addEventListener('click', start);
start();
