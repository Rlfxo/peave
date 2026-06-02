// Minimal i18n (ko/en). t(key,...args) returns string; function values are templates.
const DICT = {
  ko: {
    sub_title: 'AC 완속 충전 Peak Shaving 시뮬레이터',
    sub: 'Deadline-aware LP 스케줄링 — 피크를 깎아 운영사 순이익·계약전력 절감',
    badge: '동일 HiGHS 솔버 (논문 CVXPY+HIGHS)',
    inputs_h: '입력 설정',
    in_N: '주차장 규모 (충전기 수)', in_V: '방문 차량 (대/일)',
    in_beta: '유저 신뢰도 β (선언 채택률)', in_delta: '유저 정직성 δ (선언 오차, 분)',
    in_psell: '충전 판매단가 (₩/kWh)', in_cdem: '기본요금 (₩/kW·월)', in_arrival: '도착 패턴',
    opt_bimodal: '통근형 (아침·저녁 2-peak)', opt_flat: '균등',
    note: '미적용(StatusQuo)은 도착 즉시 풀충전 → 피크 집중. LP는 deadline 안에서 시간 분산 → 피크↓(100% 충전 유지). 피크 감소가 곧 기본요금 절감(순이익↑)·필요 계약전력↓.',
    run: '시뮬레이션 실행', run_stale: '변경됨', dice: '시드 변경',
    res_h: '결과 — 피크 & 순이익',
    parking_h: '주차장 — 차량 입·출차', timeline_h: '전력 타임라인 — 미적용 vs 적용',
    pareto_h: 'β–Pareto · 이익 최적점 β*',
    cap_sq: '알고리즘 미적용', cap_lp: 'LP 적용',
    stat_profit: '순이익 증가', stat_lever: '계약전력 레버리지', stat_red: '피크 감소', stat_eng: '에너지 충족', per_month: '/월',
    lg_sq: 'StatusQuo(미적용)', lg_lp: 'LP(적용)', lg_gold: '깎인 피크', lg_dot: '차량 plug-in', lg_cur: '현재',
    lg_peak: '피크(kW)', lg_eng: '에너지(%)', lg_pi: '이익 Π', lg_star: 'β*',
    footer: '석사논문 artifact. 웹 데모는 검증된 모델의 인터랙티브 illustration이며 실측 검증을 대체하지 않습니다.',
    status_loading: '엔진 로딩…', status_busy: '계산 중…', status_fail: '엔진 로드 실패',
    status_ready: (n) => `준비됨 · ${n}세션`,
    cv_saved: '순이익', cv_hour: '시', pk_in: '입구', pk_out: '출구',
    bstar: (b, profit, lever, pk) => `LP가 피크를 <b>${pk} kW</b>로 낮춰 → 같은 계약전력으로 <b>${lever}배</b> 충전기 운영(또는 계약전력 다운사이즈) + 기본요금 절감 <b>${profit}/월</b>. 이익 최적점 <b>β* = ${b}</b> — β=1이 SLA-안전이자 이익 최적(corner).`,
  },
  en: {
    sub_title: 'AC Level-2 Charging Peak-Shaving Simulator',
    sub: 'Deadline-aware LP scheduling — cut the peak to grow operator profit & shrink contracted power',
    badge: 'Same HiGHS solver as the paper (CVXPY+HIGHS)',
    inputs_h: 'Inputs',
    in_N: 'Lot size (chargers)', in_V: 'Vehicles / day',
    in_beta: 'User trust β (declaration rate)', in_delta: 'User honesty δ (declaration error, min)',
    in_psell: 'Charging price (₩/kWh)', in_cdem: 'Demand charge (₩/kW·mo)', in_arrival: 'Arrival pattern',
    opt_bimodal: 'Commuter (AM·PM 2-peak)', opt_flat: 'Uniform',
    note: 'Without the algorithm (StatusQuo), cars charge on arrival → peak spikes. LP spreads load within deadlines → lower peak (still 100% charged). A lower peak = lower demand charge (more profit) & smaller required contracted power.',
    run: 'Run simulation', run_stale: 'changed', dice: 'New seed',
    res_h: 'Results — peak & profit',
    parking_h: 'Parking — vehicle in/out', timeline_h: 'Power timeline — without vs. with',
    pareto_h: 'β–Pareto · profit-optimal β*',
    cap_sq: 'Without algorithm', cap_lp: 'With LP',
    stat_profit: 'Profit gain', stat_lever: 'Capacity leverage', stat_red: 'Peak cut', stat_eng: 'Energy met', per_month: '/mo',
    lg_sq: 'StatusQuo (off)', lg_lp: 'LP (on)', lg_gold: 'shaved peak', lg_dot: 'plug-in', lg_cur: 'now',
    lg_peak: 'peak(kW)', lg_eng: 'energy(%)', lg_pi: 'profit Π', lg_star: 'β*',
    footer: 'MSc thesis artifact. This demo is an interactive illustration of the validated model and does not replace real-world validation.',
    status_loading: 'loading engine…', status_busy: 'computing…', status_fail: 'engine load failed',
    status_ready: (n) => `ready · ${n} sessions`,
    cv_saved: 'profit', cv_hour: 'h', pk_in: 'IN', pk_out: 'OUT',
    bstar: (b, profit, lever, pk) => `LP cuts the peak to <b>${pk} kW</b> → run <b>${lever}×</b> more chargers on the same connection (or downsize it) + demand-charge saving <b>${profit}/mo</b>. Profit-optimal <b>β* = ${b}</b> — β=1 is both SLA-safe and profit-optimal (corner).`,
  },
};

let lang = null;
try { if (typeof localStorage !== 'undefined' && typeof localStorage.getItem === 'function') lang = localStorage.getItem('peave_lang'); } catch (e) {}
if (lang !== 'en' && lang !== 'ko') {
  const nav = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : '';
  lang = nav.toLowerCase().startsWith('en') ? 'en' : 'ko';
}

export function getLang() { return lang; }
export function setLang(l) { lang = (l === 'en' ? 'en' : 'ko'); try { if (typeof localStorage !== 'undefined' && localStorage.setItem) localStorage.setItem('peave_lang', lang); } catch (e) {} }
export function t(key, ...a) {
  const v = (DICT[lang][key] !== undefined) ? DICT[lang][key] : DICT.ko[key];
  if (v === undefined) return key;
  return typeof v === 'function' ? v(...a) : v;
}
export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
}
