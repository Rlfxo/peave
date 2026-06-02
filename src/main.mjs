// Browser app — peak-shaving framing: LP cuts the station peak vs uncontrolled StatusQuo.
// Operator value shown as PROFIT: demand-charge saving (순이익) + capacity leverage (계약전력 레버리지).
import { lpConstants, solveDay, statusQuo } from './lp.mjs';
import { generateSessions, applyDeadlines } from './sim.mjs';
import { economics, fmtWon } from './economics.mjs';
import { createTimeline } from './timeline.mjs';
import { getLang, setLang, t, applyStatic } from './i18n.mjs';

const slotMin = 15;
const cst = lpConstants({ slotMin });
let highs = null, tl = null, lastResult = null, seed = 42;

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
  const shaped = applyDeadlines(sessions, { beta: p.beta, delta: p.delta, slotMin, nSlots, cst, seed: seed + 13 });
  const lp = solveDay(highs, shaped, p.N, nSlots, cst, 0);
  const delivered = lp.energyByCharger ? lp.energyByCharger.reduce((a, b) => a + b, 0) : 0;
  const ec = economics({ peakSqKw, peakLpKw: lp.peakKw, requestedWh, deliveredWh: delivered, pSell: p.pSell, cDem: p.cDem });
  const profit = ec.energyRevenueWon - p.cDem * (Number.isFinite(lp.peakKw) ? lp.peakKw : 0);
  return { beta: p.beta, peakLp: lp.peakKw, energyPct: ec.energyPct, demandSaving: ec.demandSavingWon, profit, scheduleLp: lp.scheduleKw };
}

function run() {
  if (!highs) return;
  const p = readParams();
  syncOutputs(p);
  setStatus(t('status_busy'), 'busy');
  requestAnimationFrame(() => {
    const { sessions, nSlots } = generateSessions({ N: p.N, nVehicles: p.V, slotMin, cst, seed, arrivalMode: p.arrivalMode });
    const sq = statusQuo(sessions, p.N, nSlots, cst);  // uncontrolled (no cap)
    const requestedWh = sessions.reduce((a, s) => a + s.requestedWh, 0);
    const cur = solveBeta(sessions, p, nSlots, sq.peakKw, requestedWh);
    const betas = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
    const sweep = betas.map((b) => solveBeta(sessions, { ...p, beta: b }, nSlots, sq.peakKw, requestedWh));
    render(p, sq, cur, sweep);
    tl.setData({ N: p.N, slotMin, nSlots, sq: sq.scheduleKw, lp: cur.scheduleLp || [], sessions, peakSq: sq.peakKw, peakLp: cur.peakLp, demandSaving: cur.demandSaving });
    tl.play();
    setStatus(t('status_ready', sessions.length), 'ready');
  });
}

function render(p, sq, cur, sweep) {
  const maxKw = Math.max(sq.peakKw, 1);
  $('barSq').style.height = '150px';
  $('barLp').style.height = (150 * Math.max(0, cur.peakLp) / maxKw).toFixed(1) + 'px';
  const star = sweep.reduce((best, s) => (s.profit > best.profit ? s : best), sweep[0]);
  lastResult = { p, sq, cur, star };
  renderDynamic();
  drawPareto(sweep, p.beta, star.beta);
}

function renderDynamic() {
  if (!lastResult) return;
  const { p, sq, cur, star } = lastResult;
  $('peakSq').textContent = sq.peakKw.toFixed(1) + ' kW';
  $('peakLp').textContent = (Number.isFinite(cur.peakLp) ? cur.peakLp.toFixed(1) : '—') + ' kW';
  const redPct = (sq.peakKw - cur.peakLp) / sq.peakKw * 100;
  $('redArrow').textContent = '−' + redPct.toFixed(0) + '%';
  const lever = cur.peakLp > 0 ? sq.peakKw / cur.peakLp : 1;
  $('sProfit').textContent = fmtWon(cur.demandSaving);
  $('sLever').textContent = lever.toFixed(1) + '×';
  $('sRed').textContent = '−' + redPct.toFixed(1) + '%';
  $('sEng').textContent = (cur.energyPct * 100).toFixed(0) + '%';
  const leverStar = star.peakLp > 0 ? (sq.peakKw / star.peakLp) : 1;
  $('betastar').innerHTML = t('bstar', star.beta.toFixed(1), fmtWon(star.demandSaving), leverStar.toFixed(1), star.peakLp.toFixed(1));
}

function drawPareto(sweep, curBeta, starBeta) {
  const W = 520, H = 240, L = 46, R = 46, T = 16, B = 30, pw = W - L - R, ph = H - T - B;
  const xs = (b) => L + b * pw;
  const peakMax = Math.max(...sweep.map((s) => s.peakLp), 1) * 1.08;
  const pis = sweep.map((s) => s.profit);
  const piMin = Math.min(...pis), piMax = Math.max(...pis), piRng = (piMax - piMin) || 1;
  const yPeak = (v) => T + ph * (1 - v / peakMax), yEng = (f) => T + ph * (1 - f), yPi = (v) => T + ph * (1 - (v - piMin) / piRng);
  const poly = (pts, c) => `<polyline points="${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.2"/>`;
  const dots = (pts, c) => pts.map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${c}"/>`).join('');
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
  $('pareto').innerHTML = axis + curLine + poly(peakPts, '#e15b5b') + dots(peakPts, '#e15b5b') + poly(engPts, '#e0913a') + dots(engPts, '#e0913a') + poly(piPts, '#9b59b6') + dots(piPts, '#9b59b6') + starMark;
}

function applyI18n() {
  document.documentElement.lang = getLang();
  applyStatic();
  $('langBtn').textContent = getLang() === 'ko' ? 'EN' : '한';
  $('runBtn').dataset.stale = t('run_stale');
  renderDynamic();
  if (tl) tl.redraw();
}

(async function init() {
  applyI18n();
  setStatus(t('status_loading'));
  try {
    const factory = window.__highsFactory;
    if (typeof factory !== 'function') throw new Error('HiGHS factory');
    highs = await factory({ locateFile: (f) => 'vendor/' + f });
    if (typeof highs.solve !== 'function') throw new Error('solve()');
  } catch (e) { setStatus(t('status_fail') + ': ' + e.message, 'busy'); return; }
  tl = createTimeline($('timeline'), $('parking'), { play: $('tlPlay'), replay: $('tlReplay'), speed: $('tlSpeed'), seek: $('tlSeek') });
  $('langBtn').addEventListener('click', () => { setLang(getLang() === 'ko' ? 'en' : 'ko'); applyI18n(); });
  const markStale = () => { syncOutputs(readParams()); $('runBtn').classList.add('stale'); };
  ['N', 'V', 'B', 'D', 'Ps', 'Cd', 'AM'].forEach((id) => $(id).addEventListener('input', markStale));
  $('runBtn').addEventListener('click', () => { $('runBtn').classList.remove('stale'); run(); });
  $('diceBtn').addEventListener('click', () => { seed = (Math.random() * 1e9) | 0; $('runBtn').classList.remove('stale'); run(); });
  run();
})();
