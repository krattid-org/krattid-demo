import './style.css';
import data from './data/examples.json';
import lsHeader from './data/lightspeed-header.json';
import { createViewer, Viewer } from './viewer';

interface Line { artnr: string; ean: string; name: string; brand: string; color: string; size: string; qty: number; ek: number; frame?: string; battery?: string }
interface Flag { index: number; field: 'size' | 'frame'; raw: string; suggestions: string[] }
interface Ex { id: string; card: string; supplier: string; kind: string; nr: string; lines: Line[]; flag: Flag; net: number; files: { img: string; photo: string | null } }
interface Pos { w: number; h: number; rows: { q: number[] }[] }
type Screen = 'start' | 'review' | 'export' | 'next';

const EX = data as Ex[];
const LS = lsHeader as string[];
const app = document.getElementById('app') as HTMLElement;
const backBtn = document.getElementById('back') as HTMLButtonElement;
const topEl = document.getElementById('top') as HTMLElement;
let positions: Record<string, { doc: Pos; photo?: Pos }> | null = null;
let cur: Ex | null = null;
let lines: Line[] = [];
let confirmed = false;
let usePhoto = false;
let selected = -1;
let choice = '';
let fmt = 'lightspeed';
let timers: number[] = [];
let viewer: Viewer | null = null;
let depth = 0;

const esc = (s: string | number) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const money = (c: number) => (c / 100).toFixed(2);
const eanOk = (e: string) => {
  if (!/^\d{13}$/.test(e)) return false;
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(e[i]) * (i % 2 ? 3 : 1);
  return (10 - (s % 10)) % 10 === Number(e[12]);
};
const $ = (id: string) => document.getElementById(id) as HTMLElement;

function loadPositions(): Promise<void> {
  if (positions) return Promise.resolve();
  return fetch('/docs/positions.json').then((r) => r.json()).then((j) => { positions = j; }).catch(() => { positions = {} as never; });
}

function clearTimers() { timers.forEach((t) => window.clearTimeout(t)); timers = []; }
function later(fn: () => void, ms: number) { timers.push(window.setTimeout(fn, ms)); }
function leave() {
  clearTimers();
  if (viewer) { viewer.destroy(); viewer = null; }
}
function reset() {
  leave();
  cur = null; confirmed = false; selected = -1; usePhoto = false; choice = ''; fmt = 'lightspeed';
  lines = [];
}
function measureHeader() {
  document.documentElement.style.setProperty('--hh', topEl.offsetHeight + 'px');
}
function scrollTop() { window.scrollTo(0, 0); }

// ---------- Navigation (history API: one entry per screen) ----------
function render(s: Screen, push: boolean, st?: { photo?: boolean; id?: string }) {
  if (push) { depth += 1; history.pushState({ s, d: depth }, ''); }
  backBtn.hidden = s === 'start';
  leave();
  scrollTop();
  if (s === 'review' && st && st.id) { startReading(st.id, !!st.photo); return; }
  if (s === 'review' && cur) { check(); measureHeader(); return; }
  if (s === 'export' && cur && confirmed) { exportScreen(); return; }
  if (s === 'next' && cur) { nextScreen(); return; }
  reset();
  backBtn.hidden = true;
  startScreen();
}
window.addEventListener('popstate', (e) => {
  const st = e.state as { s: Screen; d: number } | null;
  depth = st ? st.d : 0;
  render(st ? st.s : 'start', false);
});
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
backBtn.addEventListener('click', () => {
  if (depth > 0) history.go(-depth); else render('start', false);
});

// ---------- Start ----------
function startScreen() {
  app.innerHTML = `<h1>So kommt ein Lieferschein in Ihr System</h1>
<p>Wählen Sie ein Beispiel. Aus dem Dokument wird eine geprüfte Importdatei für Ihr Kassen- und Warenwirtschaftssystem.</p>
<div class="cards">${EX.map((e) => `<div class="cardbox"><button type="button" class="card" data-id="${e.id}"><b>${esc(e.card)}</b><span>${esc(e.supplier)}</span><span>${e.lines.length} Positionen</span><span class="go">Beispiel öffnen →</span></button>${e.files.photo ? '<label class="toggle"><input type="checkbox" id="photo"> Als Handyfoto statt PDF zeigen</label>' : ''}</div>`).join('')}</div>`;
  app.querySelectorAll<HTMLButtonElement>('.card').forEach((b) => b.addEventListener('click', () => {
    const ex = EX.filter((e) => e.id === b.dataset.id)[0];
    const ph = document.getElementById('photo') as HTMLInputElement | null;
    render('review', true, { id: ex.id, photo: !!(ph && ph.checked && ex.files.photo) });
  }));
  measureHeader();
}

// ---------- Reading (3 steps, about 1.5 s) ----------
const STEPS = ['Zeilen lesen', 'EAN prüfen', 'Summe prüfen'];
function startReading(id: string, photo: boolean) {
  const ex = EX.filter((e) => e.id === id)[0];
  cur = ex; usePhoto = photo; confirmed = false; choice = ''; selected = ex.flag.index;
  lines = JSON.parse(JSON.stringify(ex.lines));
  app.innerHTML = `<div class="reading" role="status" aria-live="polite"><h1>Dokument wird gelesen …</h1>
<ol class="steps">${STEPS.map((t, i) => `<li data-i="${i}">${t}</li>`).join('')}</ol><div class="bar"><i></i></div></div>`;
  const li = app.querySelectorAll<HTMLElement>('.steps li');
  STEPS.forEach((_, i) => {
    later(() => { li[i].className = 'on'; if (i > 0) li[i - 1].className = 'ok'; }, i * 500);
  });
  later(() => { li[2].className = 'ok'; }, 1400);
  const p = loadPositions();
  later(() => { p.then(() => { if (cur === ex) { check(); measureHeader(); } }); }, 1500);
  measureHeader();
}

// ---------- Review ----------
function diffIndex(a: string, b: string) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return i;
  return -1;
}
function frameHtml(v: string, mark: boolean) {
  const f = cur!.flag;
  if (!mark || f.field !== 'frame') return esc(v);
  const i = diffIndex(f.raw, f.suggestions[0]);
  return i < 0 ? esc(v) : esc(v.slice(0, i)) + '<b class="diff">' + esc(v.charAt(i)) + '</b>' + esc(v.slice(i + 1));
}
function rowHtml(l: Line, i: number) {
  const f = cur!.flag;
  const isFlag = i === f.index;
  const cls = 'row' + (isFlag ? (confirmed ? ' done' : ' flag') : '') + (i === selected ? ' sel' : '');
  const tag = isFlag ? (confirmed ? '<em>✓ bestätigt</em>' : '<em>bitte bestätigen</em>') : '';
  const mark = isFlag && !confirmed;
  const frame = l.frame ? `<div><small>Rahmennummer</small><span class="mono">${frameHtml(l.frame, mark)}</span></div><div><small>Akku</small><span class="mono">${esc(l.battery || '')}</span></div>` : '';
  const editor = mark ? editorHtml() : '';
  return `<div class="${cls}" data-i="${i}" role="button" tabindex="0"><div class="r1"><span>${i + 1}. ${esc(l.name)}</span>${tag}</div>
<div class="cells"><div><small>Art.-Nr.</small><span class="mono">${esc(l.artnr)}</span></div><div><small>EAN</small><span class="mono">${esc(l.ean)}</span></div><div><small>Farbe</small>${esc(l.color)}</div><div><small>Grösse/Länge</small>${esc(l.size)}</div><div><small>Menge</small>${l.qty}</div><div><small>EK CHF</small>${money(l.ek)}</div>${frame}</div>${editor}</div>`;
}

function editorHtml() {
  const f = cur!.flag;
  const what = f.field === 'frame' ? 'Rahmennummer' : 'Grösse';
  let opts: string;
  let hint = '';
  if (f.field === 'frame') {
    const sug = f.suggestions[0];
    const i = diffIndex(f.raw, sug);
    const withMark = (v: string) => esc(v.slice(0, i)) + '<b class="diff">' + esc(v.charAt(i)) + '</b>' + esc(v.slice(i + 1));
    const kind = (c: string) => (/\d/.test(c) ? 'Ziffer' : 'Buchstabe');
    opts = `<button type="button" class="opt mono line${choice === sug ? ' on' : ''}" data-v="${esc(sug)}" aria-pressed="${choice === sug}">${withMark(sug)} (Vorschlag)</button>
<button type="button" class="opt mono line${choice === f.raw ? ' on' : ''}" data-v="${esc(f.raw)}" aria-pressed="${choice === f.raw}">${withMark(f.raw)} (wie gelesen)</button>`;
    hint = `<p class="hint">Gelesen: ${kind(f.raw.charAt(i))} ${esc(f.raw.charAt(i))} · Vorschlag: ${kind(sug.charAt(i))} ${esc(sug.charAt(i))}</p>`;
  } else {
    const all = f.suggestions.map((s) => ({ v: s, t: s })).concat([{ v: f.raw, t: f.raw + ' (wie gelesen)' }]);
    opts = all.map((o) => `<button type="button" class="opt${choice === o.v ? ' on' : ''}" data-v="${esc(o.v)}" aria-pressed="${choice === o.v}">${esc(o.t)}</button>`).join('');
  }
  return `<div class="editor"><p class="ed-h"><b>${what}</b> wie gelesen: <span class="mono">${esc(f.raw)}</span>. Welcher Wert stimmt?</p>
<div class="opts ${f.field === 'frame' ? 'stack' : ''}" role="group" aria-label="${what} wählen">${opts}</div>${hint}
<div class="ed-act"><button type="button" class="btn dark" id="confirm" ${choice ? '' : 'disabled'}>Position bestätigen</button>${choice ? '' : '<span class="note">Bitte eine Variante wählen</span>'}</div></div>`;
}

function sumOk() {
  const sum = Math.round(lines.reduce((s, l) => s + l.qty * l.ek, 0));
  return sum === Math.round(cur!.net * 100);
}
function chipsHtml() {
  const allEan = lines.every((l) => eanOk(l.ean));
  return `${allEan ? '<span class="chip">EAN-Prüfziffern stimmen ✓</span>' : '<span class="chip warn">EAN-Prüfziffern prüfen</span>'}
${sumOk() ? '<span class="chip">Summe stimmt mit dem Dokument ✓</span>' : '<span class="chip warn">Summe weicht vom Dokument ab</span>'}
${confirmed ? '<span class="chip" id="flagchip">1 Position bestätigt ✓</span>' : '<span class="chip warn" id="flagchip">1 Position bestätigen</span>'}`;
}

function check() {
  if (!cur) return;
  const ex = cur;
  const n = lines.length;
  const P = positions && positions[ex.id];
  const pos = P ? (usePhoto && P.photo ? P.photo : P.doc) : null;
  const img = usePhoto && ex.files.photo ? ex.files.photo : ex.files.img;
  const ratio = pos ? pos.h / pos.w : 1.414;
  app.innerHTML = `<h1 id="h1"></h1>
<div class="chips" id="chips"></div><p class="summary" id="sum"></p>
<div class="split"><div class="docpane" id="docpane"><div class="dochead"><span class="dtitle">${esc(ex.supplier)}</span><button type="button" class="btn alt" id="collapse">Dokument ausblenden</button></div>
<div class="vbox" id="vbox"><div class="vlayer" id="vlayer"><img src="/${img}" alt="${esc(ex.kind)} von ${esc(ex.supplier)}" draggable="false"><svg class="hlsvg" viewBox="0 0 1000 ${(1000 * ratio).toFixed(2)}" preserveAspectRatio="none" aria-hidden="true"><polygon id="hl" points="" style="display:none"></polygon></svg></div>
<div class="vctl" role="group" aria-label="Zoom"><button type="button" data-z="out" aria-label="Verkleinern">−</button><button type="button" data-z="in" aria-label="Vergrössern">+</button><span class="zl" aria-hidden="true">100 %</span><button type="button" class="rs" data-z="reset">Zurücksetzen</button></div></div></div>
<div><div class="rows" id="rows"></div></div></div>
<div class="barx" id="barx"><span class="barhint" id="barhint"></span><button type="button" class="btn" id="toexport" aria-disabled="true">Weiter zur Importdatei</button></div>`;
  const box = $('vbox');
  if (pos) {
    const r0 = pos.rows[0].q;
    viewer = createViewer(box, $('vlayer'), document.getElementById('hl') as unknown as SVGPolygonElement, ratio, Math.max(0, r0[1] - 0.035));
  }
  const focusRow = (i: number, animate: boolean) => {
    if (!viewer || !pos || !pos.rows[i]) return;
    $('docpane').classList.remove('collapsed');
    $('collapse').textContent = 'Dokument ausblenden';
    viewer.refresh();
    viewer.setHighlight(pos.rows[i].q);
    viewer.focus(pos.rows[i].q, animate);
  };
  const renderRows = () => {
    $('rows').innerHTML = lines.map(rowHtml).join('');
    $('chips').innerHTML = chipsHtml();
    $('h1').textContent = confirmed ? 'Alles geprüft' : 'Bitte kurz prüfen';
    $('sum').textContent = confirmed ? `Alle ${n} Positionen geprüft` : `${n - 1} von ${n} Positionen sicher erkannt · 1 zum Bestätigen`;
    const bar = $('toexport');
    bar.setAttribute('aria-disabled', confirmed ? 'false' : 'true');
    bar.classList.toggle('off', !confirmed);
    $('barhint').textContent = confirmed ? '' : 'Noch 1 Position bestätigen';
  };
  renderRows();
  if (viewer) { focusRow(selected, false); }
  $('collapse').addEventListener('click', () => {
    const pane = $('docpane');
    pane.classList.toggle('collapsed');
    $('collapse').textContent = pane.classList.contains('collapsed') ? 'Dokument einblenden' : 'Dokument ausblenden';
    if (viewer && !pane.classList.contains('collapsed')) viewer.refresh();
  });
  $('toexport').addEventListener('click', () => {
    if (!confirmed) {
      const fr = document.querySelector('.row.flag') as HTMLElement | null;
      if (fr) {
        const y = fr.getBoundingClientRect().top + window.pageYOffset - window.innerHeight / 3;
        try { window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); } catch (_) { window.scrollTo(0, Math.max(0, y)); }
        fr.classList.remove('pulse'); void fr.offsetWidth; fr.classList.add('pulse');
      }
      return;
    }
    render('export', true);
  });
  const rowsEl = $('rows');
  const onRow = (t: HTMLElement) => {
    const opt = t.closest('.opt') as HTMLElement | null;
    if (opt) { choice = opt.dataset.v || ''; renderRows(); return; }
    if (t.closest('#confirm')) {
      if (!choice) return;
      const f = ex.flag; const l = lines[f.index];
      if (f.field === 'frame') l.frame = choice; else l.size = choice;
      confirmed = true;
      renderRows();
      return;
    }
    if (t.closest('.editor')) return;
    const row = t.closest('.row') as HTMLElement | null;
    if (!row) return;
    selected = Number(row.dataset.i);
    renderRows();
    focusRow(selected, true);
  };
  rowsEl.addEventListener('click', (ev) => onRow(ev.target as HTMLElement));
  rowsEl.addEventListener('keydown', (ev) => {
    const k = (ev as KeyboardEvent).key;
    const t = ev.target as HTMLElement;
    if ((k === 'Enter' || k === ' ') && t.classList.contains('row')) { ev.preventDefault(); onRow(t); }
  });
}

// ---------- Export ----------
const FORMATS: { id: string; name: string; ext: string }[] = [
  { id: 'csv', name: 'Excel / CSV', ext: 'csv' },
  { id: 'lightspeed', name: 'Lightspeed OnSite', ext: 'txt' },
  { id: 'advarics', name: 'Advarics (Beispielformat)', ext: 'csv' },
];
const LS_FILLED = ['Product Code', 'Description', 'Family', 'UPC', 'Supplier', 'Supplier Code', 'Cost', 'Color', 'Size', 'Current', 'Inventoried', 'Inventory Quantity'];

function lsRows(): string[][] {
  const ex = cur!;
  return lines.map((l) => {
    const r: string[] = LS.map(() => '');
    const set = (k: string, v: string) => { r[LS.indexOf(k)] = v.replace(/[\t\r\n]+/g, ' '); };
    set('Product Code', l.artnr); set('Description', l.name); set('Family', l.brand); set('UPC', l.ean);
    set('Supplier', ex.supplier); set('Supplier Code', l.artnr); set('Cost', money(l.ek));
    set('Color', l.color); set('Size', l.size); set('Inventory Quantity', String(l.qty));
    set('Current', 'Y'); set('Inventoried', 'Y');
    return r;
  });
}
function table(kind: string): string[][] {
  const ex = cur!;
  const eb = ex.id === 'ebike';
  if (kind === 'advarics') {
    const h = ['Lieferant', 'Art.-Nr.', 'EAN', 'Bezeichnung', 'Farbe', 'Grösse', 'Menge', 'EK', 'VK'].concat(eb ? ['Rahmennummer', 'Akku-Nr.'] : []);
    return [h].concat(lines.map((l) => [ex.supplier, l.artnr, l.ean, l.name, l.color, l.size, String(l.qty), money(l.ek), ''].concat(eb ? [l.frame || '', l.battery || ''] : [])));
  }
  if (kind === 'lightspeed') return [LS].concat(lsRows());
  const h = ['Pos.', 'Art.-Nr.', 'EAN', 'Bezeichnung', 'Farbe', 'Grösse', 'Menge', 'EK netto CHF', 'Total CHF'].concat(eb ? ['Rahmennummer', 'Akku-Nr.'] : []);
  return [h].concat(lines.map((l, i) => [String(i + 1), l.artnr, l.ean, l.name, l.color, l.size, String(l.qty), money(l.ek), money(l.ek * l.qty)].concat(eb ? [l.frame || '', l.battery || ''] : [])));
}
function q(v: string | number) {
  const s = String(v);
  return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// Lightspeed OnSite template: tab-separated, CR line ends, UTF-8 without BOM. Others: CSV with BOM for Excel.
function fileText(kind: string) {
  if (kind === 'lightspeed') return table(kind).map((r) => r.join('\t')).join('\r') + '\r';
  return '﻿' + table(kind).map((r) => r.map(q).join(';')).join('\r\n') + '\r\n';
}
function fileName(kind: string) {
  const f = FORMATS.filter((x) => x.id === kind)[0];
  const base = kind === 'csv' ? 'excel' : kind === 'lightspeed' ? 'lightspeed-onsite' : 'advarics';
  return `${base}-beispiel-${cur!.id}.${f.ext}`;
}

function exportScreen() {
  if (!cur) return;
  scrollTop();
  const draw = (done: string) => {
    let t = table(fmt);
    if (fmt === 'lightspeed') {
      const cols = LS_FILLED.map((c) => LS.indexOf(c)).sort((a, b) => a - b);
      t = t.map((r) => cols.map((i) => r[i]));
    }
    t = t.slice(0, 6);
    const notes: Record<string, string> = {
      csv: '',
      lightspeed: 'Vollständige Lightspeed-OnSite-Vorlage, nur die Spalten aus dem Lieferschein sind ausgefüllt',
      advarics: 'Beispielformat. Das genaue Advarics-Format kläre ich mit Ihnen ab',
    };
    app.innerHTML = `<h1>Wählen Sie, in welchem Format Sie die Datei brauchen</h1>
<div class="fmt" role="group" aria-label="Format">${FORMATS.map((f) => `<button type="button" class="btn seg${f.id === fmt ? ' on' : ''}" data-f="${f.id}" aria-pressed="${f.id === fmt}">${esc(f.name)}</button>`).join('')}</div>
<h2>Vorschau der Datei</h2>
<p class="note">${lines.length} Positionen von ${esc(cur!.supplier)} · die ersten 5 Zeilen${notes[fmt] ? ' · ' + esc(notes[fmt]) : ''}</p>
<div class="prev"><table><thead><tr>${t[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
<h2>Datei herunterladen</h2>
<div class="dl"><button type="button" class="btn alt" id="make">Datei herunterladen</button><span class="mono fname">${esc(fileName(fmt))}</span>${done ? `<span class="ok" id="done">✓ ${esc(done)} erstellt</span>` : ''}</div>
<div class="bottom"><button type="button" class="btn" id="tonext">Weiter</button></div>`;
    app.querySelectorAll<HTMLButtonElement>('.fmt .btn').forEach((b) => b.addEventListener('click', () => { fmt = b.dataset.f || 'lightspeed'; draw(''); }));
    $('make').addEventListener('click', () => {
      const name = fileName(fmt);
      const blob = new Blob([fileText(fmt)], { type: (fmt === 'lightspeed' ? 'text/plain' : 'text/csv') + ';charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      window.setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      draw(name);
    });
    $('tonext').addEventListener('click', () => render('next', true));
  };
  draw('');
  measureHeader();
}

// ---------- Last screen ----------
function nextScreen() {
  scrollTop();
  app.innerHTML = `<div class="next"><h1>Mit Ihren eigenen Lieferscheinen testen</h1>
<p class="offer">Sie schicken mir bis zu 20 Lieferscheine oder Auftragsbestätigungen dieser Saison. Innert 24 Stunden bekommen Sie die Dateien für Ihr System zurück. Der Testlauf kostet CHF 290. Wenn wir danach zusammenarbeiten, ziehe ich den Betrag ab. Ganz unverbindlich.</p>
<div class="who"><img src="/brand/peeter.jpg" width="120" height="120" alt="Peeter Mauring"><p>Peeter Mauring · bis Frühling 2026 bei Ski Service Corvatsch im Verkauf und Bootfitting. Ich komme gern persönlich vorbei.</p></div>
<ul class="contact"><li><small>Telefon</small><b>079 894 00 09</b></li><li><small>E-Mail</small><b>peeter.mauring@krattid.com</b></li></ul>
<div class="btns"><a class="btn alt" href="tel:+41798940009">Anrufen</a><a class="btn" href="mailto:peeter.mauring@krattid.com?subject=Testlauf%20Lieferscheine">E-Mail</a><a class="btn alt" href="https://www.krattid.com" target="_blank" rel="noopener">Mehr über mich (krattid.com)</a></div></div>`;
  measureHeader();
}

window.addEventListener('resize', measureHeader);
history.replaceState({ s: 'start', d: 0 }, '');
render('start', false);
