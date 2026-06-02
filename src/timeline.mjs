// M2 — synced animation: (1) power-curve timeline (SQ vs LP, 24h)
// + (2) real parking lot: cars drive IN from entrance → park → charge → drive OUT to exit.
import { fmtWon } from './economics.mjs';
import { t } from './i18n.mjs';

const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, u) => a + (b - a) * u;

function roundRect(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); if (r < 0) r = 0;
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

export function createTimeline(canvas, parkCanvas, els) {
  const ctx = canvas.getContext('2d');
  const pctx = parkCanvas.getContext('2d');
  let d = null, raf = null, t0 = 0, durMs = 5500, speed = 1, playing = false, lastSlotF = 0;
  let cssW = 520, cssH = 220, pCssW = 360, pCssH = 160;
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);

  function resize() {
    const r = dpr();
    cssW = canvas.clientWidth || 520; cssH = cssW < 440 ? 180 : 210;
    canvas.style.height = cssH + 'px'; canvas.width = Math.round(cssW * r); canvas.height = Math.round(cssH * r);
    ctx.setTransform(r, 0, 0, r, 0, 0);
    pCssW = parkCanvas.clientWidth || 360;
    const N = d ? d.N : 10;
    const cols = Math.max(4, Math.min(N, Math.floor(pCssW / 56)));
    const rows = Math.ceil(N / cols), cellH = 42, laneH = 20;
    pCssH = rows * cellH + laneH + 12;
    parkCanvas.style.height = pCssH + 'px'; parkCanvas.width = Math.round(pCssW * r); parkCanvas.height = Math.round(pCssH * r);
    pctx.setTransform(r, 0, 0, r, 0, 0);
    if (d) { d._cols = cols; d._cellH = cellH; d._laneH = laneH; }
  }

  const geo = () => ({ L: 44, T: 24, pw: cssW - 60, ph: cssH - 54 });

  function drawCurves(slotF) {
    const { L, T, pw, ph } = geo();
    const n = d.nSlots, yMax = Math.max(d.peakSq, 1) * 1.1;
    const x = (tt) => L + (tt / n) * pw, y = (kw) => T + ph * (1 - Math.min(kw, yMax) / yMax), base = T + ph;
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.strokeStyle = '#e3e9ef'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, base); ctx.lineTo(L + pw, base); ctx.stroke();
    ctx.fillStyle = '#9aa7b4'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    for (const h of [0, 6, 12, 18, 24]) {
      const xx = x((h / 24) * n);
      ctx.strokeStyle = '#eef2f6'; ctx.beginPath(); ctx.moveTo(xx, T); ctx.lineTo(xx, base); ctx.stroke();
      ctx.fillText(h + t('cv_hour'), xx, base + 13);
    }
    ctx.textAlign = 'right'; ctx.fillStyle = '#e15b5b'; ctx.fillText(yMax.toFixed(0) + 'kW', L - 5, T + 4);
    const upto = Math.max(0, Math.min(n, Math.round(slotF)));
    const step = (arr) => { ctx.beginPath(); ctx.moveTo(x(0), y(arr[0] || 0)); for (let tt = 0; tt < upto; tt++) { ctx.lineTo(x(tt + 1), y(arr[tt] || 0)); ctx.lineTo(x(tt + 1), y(arr[tt + 1] != null ? arr[tt + 1] : arr[tt] || 0)); } };
    const area = (arr, col) => { step(arr); ctx.lineTo(x(upto), base); ctx.lineTo(x(0), base); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); };
    area(d.sq, 'rgba(224,145,58,0.30)'); area(d.lp, 'rgba(47,170,106,0.34)');
    ctx.lineWidth = 2; ctx.strokeStyle = '#e15b5b'; step(d.sq); ctx.stroke();
    ctx.lineWidth = 2.4; ctx.strokeStyle = '#2faa6a'; step(d.lp); ctx.stroke();
    for (const s of d.sessions) { if (s.arrivalSlot > slotF) continue; const age = slotF - s.arrivalSlot, sc = age < 3 ? 1 + (1 - age / 3) * 0.9 : 1; ctx.fillStyle = 'rgba(30,136,229,0.7)'; ctx.beginPath(); ctx.arc(x(s.arrivalSlot), base - 3, 2.2 * sc, 0, 7); ctx.fill(); }
    if (slotF >= d.peakSlot) {
      const px = x(d.peakSlot + 0.5), age = (slotF - d.peakSlot) / n, r = 4 + Math.min(10, age * 60), op = Math.max(0, 0.9 - age * 6);
      if (op > 0) { ctx.strokeStyle = `rgba(225,91,91,${op})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, y(d.peakSq), r, 0, 7); ctx.stroke(); }
      const lpAtPeak = d.lp[d.peakSlot] || 0;
      ctx.strokeStyle = '#1a3a5c'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px, y(d.peakSq)); ctx.lineTo(px, y(lpAtPeak)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#e15b5b'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'left'; ctx.fillText('⚡' + d.peakSq.toFixed(1) + 'kW', px + 6, y(d.peakSq) - 2);
      ctx.fillStyle = '#1a3a5c'; ctx.font = 'bold 12px system-ui'; ctx.fillText('−' + (((d.peakSq - d.peakLp) / d.peakSq) * 100).toFixed(0) + '%', px + 6, (y(d.peakSq) + y(lpAtPeak)) / 2);
    }
    const hx = x(slotF);
    ctx.strokeStyle = 'rgba(30,136,229,0.9)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(hx, T); ctx.lineTo(hx, base); ctx.stroke();
    const mins = Math.min(24 * 60 - 1, Math.round(slotF * d.slotMin));
    ctx.fillStyle = '#1a3a5c'; ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, L, T - 10);
    ctx.fillStyle = '#e0913a'; ctx.font = 'bold 14px system-ui'; ctx.textAlign = 'right';
    ctx.fillText(t('cv_saved') + ' ' + fmtWon(d.demandSaving * (slotF / n)), L + pw, T - 9);
  }

  function drawCarAt(c, cx, cy, w, h, batt, alpha, showBatt) {
    c.save(); c.globalAlpha = alpha;
    c.fillStyle = batt >= 0.999 ? '#2faa6a' : '#3a7bd5';
    roundRect(c, cx - w / 2, cy - h / 2, w, h, 4); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)'; roundRect(c, cx - w / 2 + 3, cy - h / 2 + 2, w - 6, h * 0.4, 2); c.fill();
    c.fillStyle = '#33414f'; c.beginPath(); c.arc(cx - w * 0.27, cy + h / 2, 2, 0, 7); c.arc(cx + w * 0.27, cy + h / 2, 2, 0, 7); c.fill();
    if (showBatt) { const bw = w * 0.8, bx = cx - bw / 2, by = cy - h / 2 - 5; c.fillStyle = '#dde6ee'; roundRect(c, bx, by, bw, 3, 1.5); c.fill(); c.fillStyle = batt >= 0.999 ? '#2faa6a' : '#e0913a'; roundRect(c, bx, by, bw * Math.min(1, batt), 3, 1.5); c.fill(); }
    c.restore();
  }

  function drawParking(slotF) {
    const w = pCssW, h = pCssH; pctx.clearRect(0, 0, w, h);
    const N = d.N, cols = d._cols, cellH = d._cellH, laneH = d._laneH, cellW = w / cols;
    const laneTop = h - laneH - 2, laneY = laneTop + laneH / 2;
    const spot = (i) => ({ x: (i % cols) * cellW + cellW / 2, y: 4 + Math.floor(i / cols) * cellH + cellH / 2 });
    for (let i = 0; i < N; i++) {
      const cx = (i % cols) * cellW + 4, cy = Math.floor(i / cols) * cellH + 4, bw = cellW - 8, bh = cellH - 10;
      pctx.strokeStyle = '#d3dde6'; pctx.setLineDash([3, 3]); pctx.lineWidth = 1; pctx.strokeRect(cx, cy, bw, bh); pctx.setLineDash([]);
      pctx.fillStyle = '#c2ccd6'; pctx.font = '8px system-ui'; pctx.textAlign = 'left'; pctx.fillText(i + 1, cx + 2, cy + 9);
    }
    pctx.fillStyle = '#eef2f6'; pctx.fillRect(0, laneTop, w, laneH);
    pctx.fillStyle = '#9aa7b4'; pctx.font = '9px system-ui';
    pctx.textAlign = 'left'; pctx.fillText('▶ ' + t('pk_in'), 4, laneY + 3);
    pctx.textAlign = 'right'; pctx.fillText(t('pk_out') + ' ▶', w - 4, laneY + 3);
    const DW = 1.6, entX = 16, exitX = w - 16, cw = Math.min(cellW - 10, 26), ch = Math.min(cellH - 16, 13);
    for (const s of d.sessions) {
      const ai = s.arrivalSlot, di = s.departureSlot;
      if (slotF < ai - DW || slotF > di + DW) continue;
      const sp = spot(s.chargerIndex); let px, py, parked = false;
      if (slotF < ai) { const u = clamp01((slotF - (ai - DW)) / DW); if (u < 0.55) { px = lerp(entX, sp.x, u / 0.55); py = laneY; } else { px = sp.x; py = lerp(laneY, sp.y, (u - 0.55) / 0.45); } }
      else if (slotF <= di) { px = sp.x; py = sp.y; parked = true; }
      else { const u = clamp01((slotF - di) / DW); if (u < 0.45) { px = sp.x; py = lerp(sp.y, laneY, u / 0.45); } else { px = lerp(sp.x, exitX, (u - 0.45) / 0.55); py = laneY; } }
      const batt = parked ? clamp01(1.3 * (slotF - ai) / Math.max(1, di - ai)) : (slotF > di ? 1 : 0.05);
      drawCarAt(pctx, px, py, cw, ch, batt, 1, parked);
    }
  }

  function draw(slotF) { if (!d) return; lastSlotF = slotF; drawCurves(slotF); drawParking(slotF); }
  function loop(now) { const p = Math.min(1, ((now - t0) / durMs) * speed); draw(easeInOutCubic(p) * d.nSlots); if (p < 1) raf = requestAnimationFrame(loop); else { playing = false; setBtn(); if (els.seek) els.seek.value = d.nSlots; } }
  function play() { if (!d) return; if (reduceMotion()) { draw(d.nSlots); return; } cancelAnimationFrame(raf); playing = true; t0 = performance.now(); setBtn(); raf = requestAnimationFrame(loop); }
  function pause() { cancelAnimationFrame(raf); playing = false; setBtn(); }
  function setBtn() { if (els.play) els.play.textContent = playing ? '⏸' : '▶'; }

  function setData(data) {
    d = data;
    d.peakSlot = data.sq.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
    d.byCharger = Array.from({ length: data.N }, () => []);
    for (const s of data.sessions) (d.byCharger[s.chargerIndex] || (d.byCharger[s.chargerIndex] = [])).push(s);
    resize(); if (els.seek) { els.seek.max = String(d.nSlots); els.seek.value = String(d.nSlots); }
    draw(d.nSlots);
  }

  if (els.play) els.play.addEventListener('click', () => (playing ? pause() : play()));
  if (els.replay) els.replay.addEventListener('click', play);
  if (els.speed) els.speed.addEventListener('change', () => { speed = +els.speed.value; });
  if (els.seek) els.seek.addEventListener('input', () => { pause(); draw(+els.seek.value); });
  window.addEventListener('resize', () => { if (d) { resize(); draw(lastSlotF); } });

  return { setData, play, pause, draw, redraw: () => { if (d) draw(lastSlotF); } };
}
