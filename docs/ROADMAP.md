# Roadmap

## V1 — current

- [x] DeepSeek Harness right-Sidebar type.
- [x] Self-contained ESM plugin entrypoints.
- [x] Harness-authenticated same-origin Host bridge.
- [x] Mock transport with normal/shadow/degraded/safe-hold/lease-lost/halted scenarios.
- [x] HTTP transport for `/v1/snapshot` and `/v1/events`.
- [x] Conservative state derivation.
- [x] Venue / strategy / position / OMS / recovery views.
- [x] Structured runtime event view.
- [x] Read-only diagnosis prompt.
- [x] Mutation buttons disabled.
- [x] Node tests for critical safety semantics.

## V1.1

- [ ] Add native Typert Remote bridge when external-plugin generated Remote artifacts are stable for standalone packages.
- [ ] Add localized Chinese/English copy.
- [ ] Add feed freshness drill-down.
- [ ] Add order execution timeline keyed by stable intent/client identity.
- [ ] Add reconnect/backoff state and better event pagination.

## V1.2

- [ ] Prometheus-compatible latency metrics view.
- [ ] P50/P95/P99 order/market path charts.
- [ ] Reconcile incident history.
- [ ] Checkpoint/journal lag trend.
- [ ] Position ownership drill-down.

## V2 control plane

Blocked until `pg-core` control/recovery production gates are complete.

- [ ] Start.
- [ ] Reload allowlisted strategy.
- [ ] Emergency reduce-only flatten + HALT.
- [ ] Typed command request ID / audit timeline.
- [ ] Confirmation UX with affected venue/asset/quantity.
- [ ] No shell commands.

## V2 Harness UX

- [ ] Compact left-Sidebar status rail.
- [ ] Click rail -> focus/open PG TSY right-Sidebar tab.
- [ ] DeepSeek diagnosis action that programmatically seeds the current session composer using the stable public conversation input facade.
