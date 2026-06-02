// Browser app — wires inputs → sim+LP+economics → bars + stats + β-Pareto chart.
import { lpConstants, solveDay, statusQuo } from './lp.mjs';
import { generateSessions, applyDeadlines } from './sim.mjs';
import { economics, fmtWon } from './economics.mjs';

const slotMin = 15;
const cst = lpConstants({ slotMin });
let highs = null;

const $ = (id) => document.getElementById(id);
const setStatus = (txt, cls = '') => { const s = $('status'); s.textContent = txt; s.className = 'status ' + cls; };

function readParams() {
  return {
    N: +$('N').value, V: +$('V').value, beta: +$('B').value, delta: +$('D').value,
    pSell: +$('Ps').value, cDem: +$('Cd').value, arrivalMode: $('AM').value,
  };
}
function syncOutputs(p) {
  $('oN').value = p.N; $('oV').value = p.V; $('oB').value = p.beta.toFixed(2);
  $('oD').value = p.delta; $('oPs').value = p.pSell.toFixed(1); $('oCd').value = p.cDem;
  $('capB').textContent = p.beta.toFixed(2);
}

function solveBeta(sessions, p, nSlots, peakSqKw, requestedWh) {
  const shaped = applyDeadlines(sessions, { beta: p.beta, delta: p.delta, slotMin, nSlots, cst, seed: 7 });
  const lp = solveDay(highs, shaped, p.N, nSlots, cst, 0); // no contract cap (non-binding for demo)
  const delivered = lp.energyByCharger ? lp.energyByCharger.reduce((a, b) => a + b, 0) : 0;
  const ec = economics({ peakSqKw, peakLpKw: lp.peakKw, requestedWh, deliveredWh: delivered, pSell: p.pSell, cDem: p.cDem });
  const profit = ec.energyRevenueWon - p.cDem * (Number.isFinite(lp.peakKw) ? lp.peakKw : 0); // monthly Π
  return { beta: p.beta, peakLp: lp.peakKw, energyPct: ec.energyPct, demandSaving: ec.demandSavingWon, profit, status: lp.status };
}

function run() {
  if (!highs) return;
  const p = readParams();
  syncOutputs(p);
  setStatus('계산 중…', 'busy');
  // defer so the "busy" paint lands before the (synchronous) solve
  requestAnimationFrame(() => {
    const { sessions, nSlots } = generateSessions({ N: p.N, nVehicles: p.V, slotMin, cst, seed: 42, arrivalMode: p.arrivalMode });
    const sq = statusQuo(sessions, p.N, nSlots, cst);
    const requestedWh = sessions.reduce((a, s) => a + s.requestedWh, 0);
    const cur = solveBeta(sessions, p, nSlots, sq.peakKw, requestedWh);
    const betas = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const sweep = betas.map((b) => solveBeta(sessions, { ...p, beta: b }, nSlots, sq.peakKw, requestedWh));
    render(p, sq, cur, sweep);
    setStatus(`준비됨 · ${sessions.length}세션`, 'ready');
  });
}

function render(p, sq, cur, sweep) {
  // before/after bars (scaled to StatusQuo peak)
  const maxKw = Math.max(sq.peakKw, 1);
  $('barSq').style.height = '160px';
  $('barLp').style.height = (160 * Math.max(0, cur.peakLp) / maxKw).toFixed(1) + 'px';
  $('peakSq').textContent = sq.peakKw.toFixed(1) + ' kW';
  $('peakLp').textContent = (Number.isFinite(cur.peakLp) ? cur.peakLp.toFixed(1) : '—') + ' kW';
  const redPct = (sq.peakKw - cur.peakLp) / sq.peakKw * 100;
  $('redArrow').textContent = '−' + redPct.toFixed(0) + '%';

  $('sRed').textContent = '−' + redPct.toFixed(1) + '%';
  $('sEng').textContent = (cur.energyPct * 100).toFixed(0) + '%';
  $('sSave').textContent = fmtWon(cur.demandSaving);
  $('sProfit').textContent = fmtWon(cur.profit);

  // β* = max profit
  const star = sweep.reduce((best, s) => (s.profit > best.profit ? s : best), sweep[0]);
  $('betastar').innerHTML = `이익 최적점 <b>β* = ${star.beta.toFixed(1)}</b> ` +
    `(Π ${fmtWon(star.profit)}/월, 에너지 ${(star.energyPct * 100).toFixed(0)}%, 피크 ${star.peakLp.toFixed(1)} kW). ` +
    (star.beta >= 0.95
      ? `현실 단가(p_sell ${p.pSell}/c_dem ${p.cDem})에서 <b>β=1이 이익 최적</b> — energy 수익이 기본요금 절감을 압도 (corner 해).`
      : `기본요금이 충분히 높아 β*가 내부로 이동 — peak 우선 구간.`);

  drawPareto(sweep, p.beta, star.beta);
}

function drawPareto(sweep, curBeta, starBeta) {
  const W = 520, H = 240, L = 46, R = 46, T = 16, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const xs = (b) => L + b * pw;
  const peakMax = Math.max(...sweep.map((s) => s.peakLp), 1) * 1.08;
  const pis = sweep.map((s) => s.profit);
  const piMin = Math.min(...pis), piMax = Math.max(...pis), piRng = (piMax - piMin) || 1;
  const yPeak = (v) => T + ph * (1 - v / peakMax);
  const yEng = (pct) => T + ph * (1 - pct);                 // pct 0..1
  const yPi = (v) => T + ph * (1 - (v - piMin) / piRng);

  const poly = (pts, color) => `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.2"/>`;
  const dots = (pts, color) => pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${color}"/>`).join('');

  const peakPts = sweep.map((s) => [xs(s.beta), yPeak(s.peakLp)]);
  const engPts = sweep.map((s) => [xs(s.beta), yEng(s.energyPct)]);
  const piPts = sweep.map((s) => [xs(s.beta), yPi(s.profit)]);

  const axis = `<line x1="${L}" y1="${T + ph}" x2="${L + pw}" y2="${T + ph}" stroke="#cdd7e0"/>` +
    [0, 0.5, 1].map((b) => `<text x="${xs(b)}" y="${H - 8}" font-size="10" fill="#6b7a8a" text-anchor="middle">β=${b}</text>`).join('') +
    `<text x="${L - 6}" y="${T + 6}" font-size="10" fill="#e15b5b" text-anchor="end">${peakMax.toFixed(0)}kW</text>` +
    `<text x="${L + pw + 6}" y="${T + 6}" font-size="10" fill="#e0913a" text-anchor="start">100%</text>`;

  const curX = xs(curBeta);
  const curLine = `<line x1="${curX.toFixed(1)}" y1="${T}" x2="${curX.toFixed(1)}" y2="${T + ph}" stroke="#1e88e5" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  const starPt = piPts[sweep.findIndex((s) => s.beta === starBeta)] || piPts[piPts.length - 1];
  const starMark = `<text x="${starPt[0].toFixed(1)}" y="${(starPt[1] - 6).toFixed(1)}" font-size="14" fill="#1a3a5c" text-anchor="middle">★</text>`;

  $('pareto').innerHTML = axis + curLine +
    poly(peakPts, '#e15b5b') + dots(peakPts, '#e15b5b') +
    poly(engPts, '#e0913a') + dots(engPts, '#e0913a') +
    poly(piPts, '#9b59b6') + dots(piPts, '#9b59b6') + starMark;
}

// ---- init ----
(async function init() {
  try {
    const factory = window.__highsFactory;
    if (typeof factory !== 'function') throw new Error('HiGHS factory 미로드');
    highs = await factory({ locateFile: (f) => 'vendor/' + f });
    if (typeof highs.solve !== 'function') throw new Error('solve() 없음');
  } catch (e) {
    setStatus('엔진 로드 실패: ' + e.message, 'busy');
    return;
  }
  let timer = null;
  const debounced = () => { clearTimeout(timer); timer = setTimeout(run, 180); };
  ['N', 'V', 'B', 'D', 'Ps', 'Cd', 'AM'].forEach((id) => $(id).addEventListener('input', debounced));
  run();
})();
