// Synthetic session generation + β/δ/ε deadline shaping.
// Distributions calibrated to thesis Phase B stats (dwell median ~3h, energy ~16 kWh).
// ε (XGBoost residual): bias −16 min, std 137 min (가상논문 §3).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Generate nVehicles candidate sessions, greedily pack onto N chargers (non-overlapping).
export function generateSessions({ N, nVehicles, slotMin, cst, seed = 42, arrivalMode = 'bimodal' }) {
  const nSlots = Math.round((24 * 60) / slotMin);
  const rng = mulberry32(seed);
  const perChargerMaxKw = cst ? cst.perChargerMaxKw : (220 * 0.98 * 30) / 1000;
  const cand = [];
  for (let k = 0; k < nVehicles; k++) {
    let arrMin;
    if (arrivalMode === 'bimodal') {
      const center = rng() < 0.5 ? 9 * 60 : 19 * 60;     // commuter morning/evening
      arrMin = center + gaussian(rng) * 90;
    } else {
      arrMin = rng() * 24 * 60;                           // flat
    }
    arrMin = Math.max(0, Math.min(24 * 60 - 30, arrMin));
    const dwellH = Math.max(0.5, Math.min(12, Math.exp(Math.log(3) + gaussian(rng) * 0.6)));
    let energyKwh = Math.max(5, Math.min(40, 16 + gaussian(rng) * 7));
    // cap request to what the TRUE dwell can physically deliver (×0.9 slack to shave) →
    // β=1 (true deadline) becomes ~100% energy; shortfall at β<1 comes from ε-tightening only.
    energyKwh = Math.min(energyKwh, dwellH * perChargerMaxKw * 0.9);
    const arrivalSlot = Math.floor(arrMin / slotMin);
    const departureSlot = Math.min(nSlots, arrivalSlot + Math.max(1, Math.round((dwellH * 60) / slotMin)));
    cand.push({ arrivalSlot, departureSlot, energyTargetWh: energyKwh * 1000 });
  }
  cand.sort((a, b) => a.arrivalSlot - b.arrivalSlot);

  const freeAt = new Array(N).fill(0);
  const placed = [];
  let turnedAway = 0;
  for (const c of cand) {
    let idx = -1;
    for (let i = 0; i < N; i++) if (freeAt[i] <= c.arrivalSlot) { idx = i; break; }
    if (idx === -1) { turnedAway++; continue; }
    freeAt[idx] = c.departureSlot;
    placed.push({ ...c, chargerIndex: idx, requestedWh: c.energyTargetWh });
  }
  return { sessions: placed, turnedAway, nSlots };
}

// Shape each session's deadline by β (adoption), δ (honesty), ε (ML error).
// Returns sessions with effective departureSlot + capped energyTargetWh (shortfall = requested − eff).
export function applyDeadlines(sessions, { beta, delta = 0, epsBiasMin = -16, epsStdMin = 137, slotMin, nSlots, cst, seed = 7 }) {
  const rng = mulberry32(seed);
  return sessions.map((s) => {
    const trueDepMin = s.departureSlot * slotMin;
    let deadlineMin;
    if (rng() < beta) {
      // user-declared: honest minus δ under-declaration (δ minutes of dishonesty)
      deadlineMin = trueDepMin - Math.abs(delta) * rng();
    } else {
      // ML-predicted: true + ε (bias negative → under-predict → tighter window)
      deadlineMin = trueDepMin + (epsBiasMin + gaussian(rng) * epsStdMin);
    }
    let depSlot = Math.round(deadlineMin / slotMin);
    depSlot = Math.max(s.arrivalSlot + 1, Math.min(nSlots, depSlot));
    const windowSlots = depSlot - s.arrivalSlot;
    // ×0.999 safety: keep energy lower-bound strictly below max deliverable to avoid
    // floating-point boundary infeasibility when the window is maximally tight.
    const deliverable = windowSlots * cst.whPerAmpSlot * cst.iCap * 0.999;
    const eff = Math.min(s.requestedWh, deliverable);
    return { ...s, departureSlot: depSlot, energyTargetWh: eff };
  });
}
