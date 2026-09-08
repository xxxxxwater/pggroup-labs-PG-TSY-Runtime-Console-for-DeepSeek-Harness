# PG TSY Runtime Console for DeepSeek Harness

A risk-aware right-Sidebar runtime console for [`pg-tsy-core-bootstrap`](https://github.com/xxxxxwater/pg-tsy-core-bootstrap), designed to run inside DeepSeek Harness without giving the browser direct SSH, Docker, exchange, IBKR, or database credentials.

> V1 is intentionally **read-only**. Runtime mutation controls remain disabled until `pg-core` exposes a production-complete typed control API for start/reload/emergency flatten. The console never substitutes shell execution for the trading control contract.

## Why this exists

A trading runtime is not healthy merely because a process is running or a websocket is connected. The console therefore promotes risk truth to first-class UI:

- `NORMAL` — telemetry fresh and new exposure allowed.
- `SHADOW` — running without real venue exposure.
- `DEGRADED` — partial capability degradation while safety remains controlled.
- `SAFE_HOLD` — new exposure fail-closed because truth/authority is incomplete.
- `HALTED` — runtime/operator halt.
- `OFFLINE` — console telemetry unavailable; **this does not prove trading is stopped**.

The important invariants are explicit:

```text
OFFLINE != STOPPED
UNKNOWN != REJECTED
WS CONNECTED != SAFE TO TRADE
PROCESS RUNNING != NORMAL
UI FAILURE != TRADING FAILURE
```

## V1 surface

The `PG TSY Runtime` tab contributes to DeepSeek Harness' right Sidebar and exposes:

- runtime/environment/version/telemetry age;
- global safety and new-exposure gate;
- PostgreSQL lease ownership, fencing token, heartbeat age;
- journal/checkpoint/dispatch state;
- reconcile status and mismatch counts;
- venue market-data/execution/reconcile health;
- feed freshness;
- strategies, signals and TTL age;
- positions and ownership identity;
- OMS open/partial/unknown orders and stable venue identity;
- recovery summary;
- structured runtime event timeline;
- a copyable **read-only** DeepSeek diagnosis prompt.

## Architecture

```text
DeepSeek Harness browser
        |
        | same-origin, authenticated by Harness
        v
PG TSY plugin Host bridge
        |
        | Bearer token stays on Host
        v
pg-core control / observability plane
        |
        +-- Market data / factors / strategy
        +-- Risk / OMS / execution
        +-- Journal / reconcile / ownership
        +-- PostgreSQL lease + fencing
        +-- Hyperliquid / IBKR / Binance PM
```

The browser never receives `PG_TSY_RUNTIME_TOKEN` and never talks directly to an exchange or server shell.

## Install

From a DeepSeek Harness installation:

```bash
dsh plugin --profile web add github:xxxxxwater/pggroup-labs-PG-TSY-Runtime-Console-for-DeepSeek-Harness
```

Restart/refresh the Web profile if required by your installation, then open the right Sidebar and choose **PG TSY Runtime** from the guide.

## Run with the built-in mock transport

Mock mode is the default, which allows UI development before `pg-core` exposes `/v1/snapshot` and `/v1/events`:

```bash
export PG_TSY_TRANSPORT=mock
export PG_TSY_MOCK_SCENARIO=normal
```

Scenarios:

```text
normal
shadow
degraded
safe_hold
lease_lost
halted
```

For example:

```bash
PG_TSY_TRANSPORT=mock PG_TSY_MOCK_SCENARIO=safe_hold dsh web
```

This makes the UI show an ambiguous-submit `SAFE_HOLD` with one `UNKNOWN` order.

## Connect to pg-core over HTTP

```bash
export PG_TSY_TRANSPORT=http
export PG_TSY_RUNTIME_URL=http://127.0.0.1:8787
export PG_TSY_RUNTIME_TOKEN='replace-with-host-only-token'
export PG_TSY_HTTP_TIMEOUT_MS=3000
```

Expected upstream endpoints:

```http
GET /v1/snapshot
GET /v1/events?after=<seq>&limit=<n>
```

See [`docs/RUNTIME-CONTRACT.md`](docs/RUNTIME-CONTRACT.md) for the V1 payload contract and [`docs/PG-CORE-INTEGRATION.md`](docs/PG-CORE-INTEGRATION.md) for the recommended Rust integration boundary.

## Security model

The plugin Host registers same-origin endpoints behind the Harness `connection.requestRejection(...)` trust fence. The Host then calls the configured runtime URL with the server-side token. No browser-side runtime token exists.

V1 deliberately does **not** implement:

- arbitrary shell execution;
- Docker socket access from the browser;
- SSH from the browser;
- direct exchange API calls;
- direct `EmergencyExit` mutation;
- automatic order retries for unknown external outcomes.

See [`docs/SECURITY.md`](docs/SECURITY.md).

## Development

No monorepo-private build script is required for V1. The repository ships self-contained ESM source as the plugin entrypoints.

```bash
npm run verify
```

The tests cover safety-state derivation, stale/offline semantics, lost lease, unknown-order fail-closed behavior, mock recovery evidence, and the read-only diagnosis prompt.

## Roadmap

1. V1 — right Sidebar, mock/http transport, risk-aware state derivation, structured events.
2. V1.1 — native Harness Remote/Typert bridge after external-plugin generation is standardized.
3. V1.2 — feed/venue drill-down and execution timeline from durable event identity.
4. V2 — typed `pg-control` mutations with explicit capabilities, audit IDs and confirmation UX.
5. V2 — left-Sidebar compact status rail (`PG TSY · NORMAL/SAFE_HOLD/HALTED`).
6. V2 — Prometheus/latency charts and historical incident/reconcile views.

## License

MIT.
