// Node de-risk test: does highs-js solve our LP and produce peak reduction?
import highsLoader from 'highs';
import { lpConstants, solveDay, statusQuo } from './src/lp.mjs';

const highs = await highsLoader();
const cst = lpConstants({ slotMin: 15 });
const nSlots = (24 * 60) / cst.slotMin; // 96

// 5 chargers, all arrive 08:00 (slot 32), depart 20:00 (slot 80), need 20 kWh each.
// At I_cap (6.468 kW), 20 kWh needs ~3.1h; window is 12h → lots of slack to shave.
const N = 5;
const sessions = Array.from({ length: N }, (_, i) => ({
  chargerIndex: i, arrivalSlot: 32, departureSlot: 80, energyTargetWh: 20000,
}));

const sq = statusQuo(sessions, N, nSlots, cst);
const lp = solveDay(highs, sessions, N, nSlots, cst, 175);

console.log('=== highs-js LP de-risk test ===');
console.log('StatusQuo peak (kW):', sq.peakKw.toFixed(2));
console.log('LP peak       (kW):', lp.peakKw.toFixed(2), '| status:', lp.status);
console.log('LP energy delivered (kWh):', (lp.energyByCharger.reduce((a, b) => a + b, 0) / 1000).toFixed(1), '/ requested 100.0');
const red = ((sq.peakKw - lp.peakKw) / sq.peakKw) * 100;
console.log('peak reduction:', red.toFixed(1), '%');

// sanity: 5 chargers * 6.468 kW = 32.34 kW if all charge at once (StatusQuo).
// LP should spread to ~ (5*20kWh)/(12h) = 8.33 kW theoretical min.
const ok = lp.status === 'Optimal' && lp.peakKw < sq.peakKw && lp.peakKw > 7 && lp.peakKw < 12;
console.log(ok ? '\n✅ PASS — highs solves, LP shaves peak toward theoretical min (~8.3 kW)' : '\n❌ FAIL — check LP');
process.exit(ok ? 0 : 1);
