// Operator economics — docs/economic_model.md (Thesis.no2)
//   Π = m·E − κ·c_dem·P_peak ,  m = p_sell − c_buy (margin)
// Demand-charge saving is the peak-shaving lever; β* = corner (β=1 for realistic m).
import { getLang } from './i18n.mjs';

export function economics({
  peakSqKw, peakLpKw, requestedWh, deliveredWh,
  pSell = 324.4,   // ₩/kWh 충전 판매단가 (사용자 제공)
  cBuy = 120,      // ₩/kWh 매입 전력량요금 (placeholder)
  cDem = 8320,     // ₩/kW·월 기본요금 (한전 고압II placeholder)
  kappa = 1,       // coincidence factor (EV peak = 청구 peak 비율)
  daysPerMonth = 30,
}) {
  const reqKwh = requestedWh / 1000;
  const delKwh = deliveredWh / 1000;
  const margin = pSell - cBuy;
  const demandSavingWon = kappa * cDem * Math.max(0, peakSqKw - peakLpKw);     // ₩/월
  const energyRevenueWon = margin * delKwh * daysPerMonth;                      // ₩/월 (마진 기준)
  const energyPct = reqKwh > 0 ? delKwh / reqKwh : 1;
  const peakRedPct = peakSqKw > 0 ? (peakSqKw - peakLpKw) / peakSqKw : 0;
  return { margin, demandSavingWon, energyRevenueWon, energyPct, peakRedPct, reqKwh, delKwh };
}

export function fmtWon(won) {
  const a = Math.abs(won);
  if (getLang() === 'en') {
    if (a >= 1e6) return '₩' + (won / 1e6).toFixed(2) + 'M';
    if (a >= 1e3) return '₩' + (won / 1e3).toFixed(0) + 'k';
    return '₩' + Math.round(won);
  }
  if (a >= 1e8) return (won / 1e8).toFixed(2) + '억원';
  if (a >= 1e4) return (won / 1e4).toFixed(1) + '만원';
  return Math.round(won).toLocaleString() + '원';
}
