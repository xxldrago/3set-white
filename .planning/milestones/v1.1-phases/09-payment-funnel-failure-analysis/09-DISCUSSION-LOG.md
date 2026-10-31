# Phase 9 Discussion Log

*Phase: 09 — Payment Funnel & Failure Analysis*
*Gathered: 2026-10-26*

## Areas Discussed

### 1. Payment window (expired threshold)
- **Question:** Какой duration считать payment window для expired?
- **Selected:** 24 часа
- **Rationale:** Standard Platega window, simple constant, easy to understand.

### 2. Funnel visualization
- **Question:** Как визуализировать воронку?
- **Selected:** Карточки с % (4 карточки в GRID, каждая: step name + count + conversion % + drop-off %)
- **Rationale:** Consistent with existing KPI card pattern, clear conversion/drop-off visibility.

### 3. Timing metrics scope
- **Question:** Какие заказы включать в расчёт времени?
- **Selected:** Только успешные цепочки (pending → paid → provisioned)
- **Rationale:** Failed/canceled orders don't have meaningful timing for "time to payment".

### 4. Error code breakdown
- **Question:** Какая детализация errorCode?
- **Selected:** Сырые errorCode значения
- **Rationale:** Maximum signal, no loss of provider-specific information.

### 5. UI placement
- **Question:** Где разместить новые блоки?
- **Selected:** Ниже всех существующих секций (ниже retention)
- **Rationale:** Additive, doesn't disturb first-screen layout.

## Decisions Summary
- D-01: Payment window = 24h (hardcoded constant)
- D-02: Funnel = 4 MetricCards in GRID
- D-03: Error breakdown by raw errorCode, null → "unknown"
- D-04: Timing = successful chains only
- D-05: UI = three new AnalyticsSection blocks below retention
- D-06: Period selector = shared ?period (7|30|90); expired = point-in-time
