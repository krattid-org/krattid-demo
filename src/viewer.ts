// Zoomable document viewer: CSS transform on an inner layer.
// Touch events (pinch, pan, double-tap) for Safari 15; pointer events for mouse/pen; wheel for desktop.
export interface View { s: number; tx: number; ty: number }
export interface Viewer {
  focus(q: number[], animate: boolean): void;
  home(animate: boolean): void;
  zoomStep(f: number): void;
  refresh(): void;
  setHighlight(q: number[] | null): void;
  get(): View;
  destroy(): void;
}

const MIN = 1;
const MAX = 4;
const FOCUS = 2.5;
const SVG_W = 1000;

interface Pt { x: number; y: number }
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (p: Pt[]): Pt => {
  let x = 0, y = 0;
  for (let i = 0; i < p.length; i++) { x += p[i].x; y += p[i].y; }
  return { x: x / p.length, y: y / p.length };
};

export function createViewer(box: HTMLElement, layer: HTMLElement, poly: SVGPolygonElement, ratio: number, homeY: number): Viewer {
  let s = 1, tx = 0, ty = 0;
  let lw = 0, lh = 0;
  let anim = 0;
  let lastTouch = 0;
  const reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const hasTouch = 'ontouchstart' in window;

  const clampS = (v: number) => Math.min(MAX, Math.max(MIN, v));
  function clampT(ns: number, x: number, y: number): [number, number] {
    const W = box.clientWidth, H = box.clientHeight, cw = lw * ns, ch = lh * ns;
    const cx = cw <= W ? (W - cw) / 2 : Math.min(0, Math.max(W - cw, x));
    const cy = ch <= H ? (H - ch) / 2 : Math.min(0, Math.max(H - ch, y));
    return [cx, cy];
  }
  function apply() {
    const t = clampT(s, tx, ty);
    tx = t[0]; ty = t[1];
    layer.style.transform = 'matrix(' + s + ',0,0,' + s + ',' + tx + ',' + ty + ')';
    box.setAttribute('data-scale', s.toFixed(3));
    box.setAttribute('data-tx', tx.toFixed(1));
    box.setAttribute('data-ty', ty.toFixed(1));
    const lab = box.querySelector('.zl');
    if (lab) lab.textContent = Math.round(s * 100) + ' %';
    // keep the highlight outline about 3 screen pixels wide at every zoom level
    const unit = SVG_W / (lw || 1);
    poly.setAttribute('stroke-width', String((3 * unit) / s));
    const inMin = box.querySelector<HTMLButtonElement>('[data-z="out"]');
    const inMax = box.querySelector<HTMLButtonElement>('[data-z="in"]');
    if (inMin) inMin.disabled = s <= MIN + 0.001;
    if (inMax) inMax.disabled = s >= MAX - 0.001;
  }
  function stopAnim() {
    window.clearTimeout(anim);
    layer.classList.remove('anim');
  }
  function go(ns: number, x: number, y: number, animate: boolean) {
    stopAnim();
    ns = clampS(ns);
    const t = clampT(ns, x, y);
    if (animate && !reduce) {
      layer.classList.add('anim');
      anim = window.setTimeout(() => layer.classList.remove('anim'), 420);
    }
    s = ns; tx = t[0]; ty = t[1];
    apply();
  }
  function zoomAt(ns: number, px: number, py: number, animate: boolean) {
    ns = clampS(ns);
    const k = ns / s;
    go(ns, px - (px - tx) * k, py - (py - ty) * k, animate);
  }
  function homeView(animate: boolean) {
    go(1, 0, -homeY * lh, animate);
  }
  function refresh() {
    const W = box.clientWidth;
    if (!W) return;
    const f = lw ? W / lw : 1;
    lw = W; lh = W * ratio;
    layer.style.width = lw + 'px';
    layer.style.height = lh + 'px';
    tx *= f; ty *= f;
    apply();
  }
  function setHighlight(q: number[] | null) {
    if (!q) { poly.style.display = 'none'; return; }
    const pts: string[] = [];
    for (let i = 0; i < 8; i += 2) pts.push((q[i] * SVG_W).toFixed(2) + ',' + (q[i + 1] * SVG_W * ratio).toFixed(2));
    poly.setAttribute('points', pts.join(' '));
    poly.style.display = 'block';
  }
  function focus(q: number[], animate: boolean) {
    let cx = 0, cy = 0;
    for (let i = 0; i < 8; i += 2) { cx += q[i]; cy += q[i + 1]; }
    cx /= 4; cy /= 4;
    const ns = Math.max(s, FOCUS);
    const W = box.clientWidth, H = box.clientHeight;
    go(ns, W / 2 - cx * lw * ns, H / 2 - cy * lh * ns, animate);
  }

  // ---- gesture engine (shared by touch and pointer input) ----
  let g: { n: number; s0: number; tx0: number; ty0: number; d0: number; mx0: number; my0: number } | null = null;
  function base(p: Pt[]) {
    if (!p.length) { g = null; return; }
    const m = mid(p);
    g = { n: p.length, s0: s, tx0: tx, ty0: ty, d0: p.length > 1 ? dist(p[0], p[1]) : 0, mx0: m.x, my0: m.y };
  }
  function gMove(p: Pt[]) {
    if (!g || p.length !== g.n) { base(p); return; }
    const m = mid(p);
    if (g.n > 1 && g.d0 > 0) {
      const ns = clampS(g.s0 * dist(p[0], p[1]) / g.d0);
      const cx = (g.mx0 - g.tx0) / g.s0, cy = (g.my0 - g.ty0) / g.s0;
      s = ns; tx = m.x - cx * ns; ty = m.y - cy * ns;
    } else {
      tx = g.tx0 + m.x - g.mx0; ty = g.ty0 + m.y - g.my0;
    }
    apply();
  }
  const local = (cx: number, cy: number): Pt => {
    const r = box.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  };
  const inCtl = (t: EventTarget | null) => !!(t && (t as HTMLElement).closest && (t as HTMLElement).closest('.vctl'));

  // touch
  let tapT = 0, tapX = 0, tapY = 0, downT = 0, downX = 0, downY = 0, moved = false, gestured = false;
  const touchPts = (e: TouchEvent): Pt[] => {
    const a: Pt[] = [];
    for (let i = 0; i < e.touches.length; i++) a.push(local(e.touches[i].clientX, e.touches[i].clientY));
    return a;
  };
  function onTS(e: TouchEvent) {
    if (inCtl(e.target)) return;
    lastTouch = Date.now();
    e.preventDefault();
    stopAnim();
    const p = touchPts(e);
    if (p.length === 1) { downT = Date.now(); downX = p[0].x; downY = p[0].y; moved = false; gestured = false; } else { gestured = true; }
    base(p);
  }
  function onTM(e: TouchEvent) {
    if (!g) return;
    lastTouch = Date.now();
    e.preventDefault();
    const p = touchPts(e);
    if (p.length === 1 && Math.hypot(p[0].x - downX, p[0].y - downY) > 10) moved = true;
    if (p.length > 1) gestured = true;
    gMove(p);
  }
  function onTE(e: TouchEvent) {
    if (!g) return;
    lastTouch = Date.now();
    e.preventDefault();
    const p = touchPts(e);
    if (p.length === 0) {
      const now = Date.now();
      if (!moved && !gestured && now - downT < 300) {
        if (now - tapT < 350 && Math.hypot(downX - tapX, downY - tapY) < 40) {
          tapT = 0;
          if (s >= MAX - 0.01) homeView(true); else zoomAt(s * 2, downX, downY, true);
        } else { tapT = now; tapX = downX; tapY = downY; }
      }
      g = null;
    } else base(p);
  }

  // pointer (mouse, pen; touch only when the browser has no touch events)
  const ptrs: { [id: number]: Pt } = {};
  const ptrList = () => Object.keys(ptrs).map((k) => ptrs[Number(k)]);
  function onPD(e: PointerEvent) {
    if (e.pointerType === 'touch' && hasTouch) return;
    if (inCtl(e.target)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { box.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    ptrs[e.pointerId] = local(e.clientX, e.clientY);
    stopAnim();
    base(ptrList());
    box.classList.add('grab');
  }
  function onPM(e: PointerEvent) {
    if (!(e.pointerId in ptrs)) return;
    ptrs[e.pointerId] = local(e.clientX, e.clientY);
    gMove(ptrList());
  }
  function onPU(e: PointerEvent) {
    if (!(e.pointerId in ptrs)) return;
    delete ptrs[e.pointerId];
    const l = ptrList();
    base(l);
    if (!l.length) box.classList.remove('grab');
  }
  function onDbl(e: MouseEvent) {
    if (Date.now() - lastTouch < 800 || inCtl(e.target)) return;
    const p = local(e.clientX, e.clientY);
    if (s >= MAX - 0.01) homeView(true); else zoomAt(s * 2, p.x, p.y, true);
  }
  function onWheel(e: WheelEvent) {
    e.preventDefault();
    stopAnim();
    const k = e.deltaMode === 1 ? 16 : 1;
    if (e.ctrlKey || e.metaKey) {
      const p = local(e.clientX, e.clientY);
      zoomAt(s * Math.exp(-e.deltaY * k * 0.01), p.x, p.y, false);
    } else {
      tx -= e.deltaX * k; ty -= e.deltaY * k;
      apply();
    }
  }
  const stop = (e: Event) => e.preventDefault();
  function onClick(e: MouseEvent) {
    const b = (e.target as HTMLElement).closest ? (e.target as HTMLElement).closest('[data-z]') as HTMLElement | null : null;
    if (!b) return;
    const z = b.getAttribute('data-z');
    if (z === 'reset') homeView(true);
    else zoomAt(s * (z === 'in' ? 1.5 : 1 / 1.5), box.clientWidth / 2, box.clientHeight / 2, true);
  }

  const opt = { passive: false } as AddEventListenerOptions;
  box.addEventListener('touchstart', onTS, opt);
  box.addEventListener('touchmove', onTM, opt);
  box.addEventListener('touchend', onTE, opt);
  box.addEventListener('touchcancel', onTE, opt);
  box.addEventListener('gesturestart', stop, opt);
  box.addEventListener('gesturechange', stop, opt);
  box.addEventListener('gestureend', stop, opt);
  box.addEventListener('pointerdown', onPD);
  box.addEventListener('pointermove', onPM);
  box.addEventListener('pointerup', onPU);
  box.addEventListener('pointercancel', onPU);
  box.addEventListener('dblclick', onDbl);
  box.addEventListener('wheel', onWheel, opt);
  box.addEventListener('click', onClick);
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => refresh()); ro.observe(box); }
  refresh();
  homeView(false);

  return {
    focus, setHighlight,
    home: homeView,
    zoomStep: (f: number) => zoomAt(s * f, box.clientWidth / 2, box.clientHeight / 2, true),
    refresh,
    get: () => ({ s, tx, ty }),
    destroy: () => { stopAnim(); if (ro) ro.disconnect() },
  };
}
