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
PENDING/UNKNOWN = missing evidence
WS CONNECTED != SAFE TO TRADE
PROCESS RUNNING != NORMAL
UI FAILURE != TRADING FAILURE
```

## V1 surface

The `PG TSY Runtime` tab contributes to DeepSeek Harness' right Sidebar and exposes:

- runtime/environment/version/telemetry age;
- global safety and new-exposure gate;
- exact Rust startup gates (`PENDING` / `PASSED` / `FAILED`);
- PostgreSQL lease ownership, fencing token, heartbeat age;
- journal/checkpoint/dispatch state;
- reconcile status and mismatch counts;
- required feed inventory and freshness state;
- venue market-data/execution/reconcile health;
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
pg-core / pg-observability
        |
        +-- RuntimeSnapshot v1
        +-- startup gates
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

## Real pg-core observability is now supported

`pg-tsy-core-bootstrap` now exposes the versioned read-only contract:

```http
GET /v1/snapshot
GET /v1/events?after=<seq>&limit=<n>
```

Start the Rust side in shadow mode first:

```bash
cd pg-tsy-core-bootstrap/rust

export PG_INSTANCE_ID=pg-shadow-01
export PG_RUN_MODE=shadow
export PG_STRATEGY_DIR=../strategies
export PG_OBSERVABILITY_BIND=127.0.0.1:8787
export PG_OBSERVABILITY_TOKEN='replace-with-a-long-random-secret'

cargo run -p pg-core
```

Then configure the DeepSeek Harness **Host** process:

```bash
export PG_TSY_RUNTIME_URL=http://127.0.0.1:8787
export PG_TSY_RUNTIME_TOKEN="$PG_OBSERVABILITY_TOKEN"
export PG_TSY_HTTP_TIMEOUT_MS=3000

dsh web
```

When `PG_TSY_RUNTIME_URL` is present, the plugin automatically selects HTTP transport. You may still set it explicitly:

```bash
export PG_TSY_TRANSPORT=http
```

The plugin validates `runtime.snapshot.v1` before rendering it. A wrong schema or malformed event envelope fails as telemetry unavailable instead of being accepted as trading truth.

### Expected first real state

Do not expect the first HTTP-connected screen to become green merely because `pg-core` is listening.

The Rust runtime currently publishes real configuration, strategy inventory, required feed inventory and startup-gate evidence. Components that are not yet wired into the complete live orchestration deliberately remain `PENDING` / `UNKNOWN` — for example lease/journal/OMS/reconcile/venue authority until those components report it.

Therefore an initial real screen such as this is valid:

```text
PG TSY Runtime · SAFE_HOLD

Startup                 NOT READY
StrategyAllowlistLoaded PASSED
RuntimeLeaseAcquired    PENDING
Journal                 UNKNOWN
Reconcile               UNKNOWN
Hyperliquid feed        PENDING
New exposure            BLOCKED
```

That is the intended fail-closed behavior, not a Mock fallback.

See [`docs/PG-CORE-INTEGRATION.md`](docs/PG-CORE-INTEGRATION.md).

## Built-in Mock transport

Mock remains available for UI development when no runtime URL is configured:

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

If neither `PG_TSY_TRANSPORT` nor `PG_TSY_RUNTIME_URL` is set, Mock is retained as the developer-safe fallback. An explicitly invalid transport fails at startup and never silently downgrades to Mock.

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

The repository ships self-contained ESM source as the plugin entrypoints.

```bash
npm run verify
```

Tests cover safety-state derivation, stale/offline semantics, lost lease, unknown-order fail-closed behavior, Rust startup-gate decoding, strict runtime schema validation, real HTTP transport selection, mock recovery evidence, and the read-only diagnosis prompt.

## Roadmap

1. V1 — right Sidebar, real `runtime.snapshot.v1` HTTP + Mock fallback, startup/feed evidence, structured events.
2. V1.1 — wire PostgreSQL lease/fencing, journal, feed supervisor, OMS, ownership and continuous reconcile into the Rust `RuntimeObservatory`.
3. V1.2 — feed/venue drill-down and execution timeline from durable event identity.
4. V2 — native Harness Remote/Typert bridge after external-plugin generation is standardized.
5. V2 — typed `pg-control` mutations with explicit capabilities, audit IDs and confirmation UX.
6. V2 — left-Sidebar compact status rail (`PG TSY · NORMAL/SAFE_HOLD/HALTED`).
7. V2 — Prometheus/latency charts and historical incident/reconcile views.

## License

MIT.
