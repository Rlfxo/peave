# PEAVE — Peak-Energy-Aware EV Scheduling

> **P**eak-**E**nergy-**A**ware **EV** scheduling — AC 완속 충전 deadline-aware LP peak-shaving 시뮬레이터

AC Level 2 EV 충전기의 **deadline-aware LP 스케줄링**을 인터랙티브로 보여주는 데모.
주차장 규모·방문 차량·유저 신뢰도(β)·정직성(δ)·충전요금을 입력하면, 알고리즘 **적용 전/후의 피크(kW)와 운영사 수익(₩)**을 비교하고 **이익 최적점 β\***를 계산한다.

> 석사논문 *"AC EV 충전기 PWM 스케줄링을 위한 ML 기반 출차시간 예측 + Deadline-Aware Peak Shaving"* 의 재현성 artifact.

## 핵심: 논문과 같은 솔버

LP 엔진은 논문 파이프라인(CVXPY + **HiGHS**)과 **동일한 HiGHS 솔버**(WebAssembly 빌드 [`highs-js`](https://github.com/lovasoa/highs-js))를 브라우저에서 실행한다. 따라서 웹 데모의 수치가 Python 결과와 일치한다 ("웹이라 가짜 모델" 아님). 도착·체류·에너지 분포는 Phase B fleet(58,146 세션) 통계로 캘리브레이션.

**정직한 포지셔닝**: 본 데모는 *검증된 모델의 인터랙티브 illustration*이며 실측(real-world) 검증을 대체하지 않는다.

## 실행 (로컬)

빌드 불필요 — 정적 파일. 아무 정적 서버로:

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

(WASM 로드 때문에 `file://` 직접 열기는 불가, 서버 필요.)

## 입력 → 논문 변수 매핑

| UI 입력 | 논문 변수 |
|---|---|
| 주차장 규모 | N_chargers |
| 방문 예상 차량 | 도착 process |
| 유저 신뢰도 β | β (Peak-Energy Pareto lever) |
| 유저 정직성 δ | δ (선언 정확도) |
| 충전요금 / 기본요금 | p_sell / c_dem (경제 모델) |

## 결과

- **피크 비교**: StatusQuo(미적용, 도착 즉시 최대전류) vs LP(deadline-aware `min·maxₜ ΣP`)
- **경제**: 기본요금 절감(₩/월) + 운영 이익 Π = margin·E − c_dem·peak
- **β–Pareto**: β를 낮추면 피크↓ 그러나 에너지 충족↓ (ε deadline 압축). **β\*** = 이익 최대점 (현실 단가에서 corner β=1)

## 기술

- Vanilla ES modules + [highs-js](https://github.com/lovasoa/highs-js) (HiGHS WASM, `vendor/`) — **zero build**
- `src/lp.mjs` LP 엔진 (Python `solve_day` 포팅) · `src/sim.mjs` 세션 생성 + β/δ/ε · `src/economics.mjs` Π 모델
- node 검증: `node test_lp.mjs`, `node test_sim.mjs`

## 배포 (GitHub Pages)

정적 사이트라 그대로 Pages 호스팅 가능 (별도 빌드 없음): repo Settings → Pages → branch `main` / root.

## 라이선스

코드 MIT. HiGHS는 MIT (lovasoa/highs-js).
