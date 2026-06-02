// LP engine — faithful port of DB-Tinkaton/src/tinkaton/lp_solver.py:solve_day
// Formulation:  min peak
//   s.t.  I[i,t] in [0, I_cap] on active slots, 0 otherwise
//         sum_t I[i,t] * (V*eta*slot_hours) >= E_target[i]   (Wh)
//         (V*eta/1000) * sum_i I[i,t]  <= peak        for all t
//         (V*eta/1000) * sum_i I[i,t]  <= P_contract  for all t
// `highs` is injected (node: npm "highs"; browser: CDN) so the SAME HiGHS
// solver as the Python pipeline (CVXPY+HIGHS) runs client-side → results match.

export function lpConstants({ slotMin = 15, eta = 0.98, iCap = 30, V = 220 } = {}) {
  const slotHours = slotMin / 60;
  return {
    eta, iCap, V, slotMin, slotHours,
    kwPerAmp: (V * eta) / 1000,            // kW per amp (instantaneous, slot-independent)
    whPerAmpSlot: V * eta * slotHours,     // Wh per amp per slot
    perChargerMaxKw: (V * eta * iCap) / 1000,
  };
}

// sessions: [{ chargerIndex, arrivalSlot, departureSlot, energyTargetWh }]
// Returns CPLEX LP-format string.
export function buildDayLP(sessions, N, nSlots, cst, pContractKw = 0) {
  const K = cst.kwPerAmp.toFixed(6);
  const active = Array.from({ length: N }, () => new Set());
  const energyTarget = new Array(N).fill(0);
  for (const s of sessions) {
    const a = Math.max(0, s.arrivalSlot);
    const d = Math.min(nSlots, s.departureSlot);
    for (let t = a; t < d; t++) active[s.chargerIndex].add(t);
    energyTarget[s.chargerIndex] += s.energyTargetWh;
  }
  const v = (i, t) => `c_${i}_${t}`;

  let lp = 'Minimize\n obj: peak\nSubject To\n';

  // station peak per slot:  peak - K*sum_i I[i,t] >= 0
  for (let t = 0; t < nSlots; t++) {
    const terms = [];
    for (let i = 0; i < N; i++) if (active[i].has(t)) terms.push(`${K} ${v(i, t)}`);
    if (terms.length) lp += ` pk_${t}: peak - ${terms.join(' - ')} >= 0\n`;
  }
  // energy per charger:  sum_t I[i,t] >= E_target/whPerAmpSlot
  for (let i = 0; i < N; i++) {
    if (energyTarget[i] <= 0) continue;
    const ts = [...active[i]].sort((a, b) => a - b);
    if (!ts.length) continue;
    const rhs = (energyTarget[i] / cst.whPerAmpSlot).toFixed(6);
    lp += ` en_${i}: ${ts.map((t) => v(i, t)).join(' + ')} >= ${rhs}\n`;
  }
  // contract cap per slot
  if (pContractKw > 0) {
    for (let t = 0; t < nSlots; t++) {
      const terms = [];
      for (let i = 0; i < N; i++) if (active[i].has(t)) terms.push(`${K} ${v(i, t)}`);
      if (terms.length) lp += ` ct_${t}: ${terms.join(' + ')} <= ${pContractKw}\n`;
    }
  }
  // bounds
  lp += 'Bounds\n';
  for (let i = 0; i < N; i++) for (const t of active[i]) lp += ` 0 <= ${v(i, t)} <= ${cst.iCap}\n`;
  lp += 'End\n';
  return lp;
}

export function solveDay(highs, sessions, N, nSlots, cst, pContractKw = 0) {
  if (!sessions.length) return { peakKw: 0, status: 'empty', energyByCharger: new Array(N).fill(0), scheduleKw: [] };
  const lp = buildDayLP(sessions, N, nSlots, cst, pContractKw);
  const sol = highs.solve(lp, { output_flag: false, presolve: 'on' });
  if (sol.Status !== 'Optimal') return { peakKw: NaN, status: sol.Status, energyByCharger: null, scheduleKw: [] };

  const energyByCharger = new Array(N).fill(0);
  const stationAmps = new Array(nSlots).fill(0);
  for (const [name, col] of Object.entries(sol.Columns)) {
    if (name === 'peak') continue;
    const m = name.match(/^c_(\d+)_(\d+)$/);
    if (!m) continue;
    const i = +m[1], t = +m[2], amps = col.Primal || 0;
    energyByCharger[i] += amps * cst.whPerAmpSlot;
    stationAmps[t] += amps;
  }
  const scheduleKw = stationAmps.map((a) => a * cst.kwPerAmp);
  return { peakKw: sol.ObjectiveValue, status: 'Optimal', energyByCharger, scheduleKw };
}

// StatusQuo baseline: uncontrolled — charge at I_cap from arrival until energy met.
// Returns per-slot station kW + peak. Uses TRUE windows (no deadline shaping).
export function statusQuo(sessions, N, nSlots, cst) {
  const stationAmps = new Array(nSlots).fill(0);
  const energyByCharger = new Array(N).fill(0);
  for (const s of sessions) {
    let remainingWh = s.energyTargetWh;
    const a = Math.max(0, s.arrivalSlot), d = Math.min(nSlots, s.departureSlot);
    for (let t = a; t < d && remainingWh > 1e-9; t++) {
      const deliver = Math.min(cst.whPerAmpSlot * cst.iCap, remainingWh); // Wh this slot at I_cap
      const amps = deliver / cst.whPerAmpSlot;
      stationAmps[t] += amps;
      energyByCharger[s.chargerIndex] += deliver;
      remainingWh -= deliver;
    }
  }
  const scheduleKw = stationAmps.map((a) => a * cst.kwPerAmp);
  return { peakKw: Math.max(0, ...scheduleKw), scheduleKw, energyByCharger };
}
