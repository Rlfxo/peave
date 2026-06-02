// Full-pipeline test: generate → β sweep → StatusQuo/LP → economics
import highsLoader from 'highs';
import { lpConstants, solveDay, statusQuo } from './src/lp.mjs';
import { generateSessions, applyDeadlines } from './src/sim.mjs';
import { economics, fmtWon } from './src/economics.mjs';

const highs = await highsLoader();
const slotMin = 15;
const cst = lpConstants({ slotMin });
const N = 25, nVehicles = 40, pContract = 175;

const { sessions, turnedAway, nSlots } = generateSessions({ N, nVehicles, slotMin, cst, seed: 42 });
console.log(`generated: ${sessions.length} placed / ${turnedAway} turned away (N=${N}, vehicles=${nVehicles})`);

const sq = statusQuo(sessions, N, nSlots, cst);
const requestedWh = sessions.reduce((a, s) => a + s.requestedWh, 0);
console.log(`StatusQuo peak: ${sq.peakKw.toFixed(2)} kW, energy ${(requestedWh / 1000).toFixed(0)} kWh\n`);
console.log('β    peak(kW)  vs SQ    energy%   기본요금절감/월   이익(margin)/월');

for (const beta of [0.0, 0.3, 0.5, 0.8, 1.0]) {
  const shaped = applyDeadlines(sessions, { beta, delta: 0, slotMin, nSlots, cst, seed: 7 });
  const lp = solveDay(highs, shaped, N, nSlots, cst, pContract);
  const delivered = lp.energyByCharger ? lp.energyByCharger.reduce((a, b) => a + b, 0) : 0;
  const ec = economics({ peakSqKw: sq.peakKw, peakLpKw: lp.peakKw, requestedWh, deliveredWh: delivered });
  console.log(
    `${beta.toFixed(1)}   ${lp.peakKw.toFixed(2).padStart(6)}   ${(ec.peakRedPct * 100).toFixed(1).padStart(5)}%   ` +
    `${(ec.energyPct * 100).toFixed(0).padStart(5)}%    ${fmtWon(ec.demandSavingWon).padStart(10)}    ${fmtWon(ec.energyRevenueWon).padStart(10)}`
  );
}

console.log('\n기대: β↓ → peak↓ 그러나 energy%↓ (Pareto). β=1이 energy 100% + 이익 최대 (β*=corner).');
