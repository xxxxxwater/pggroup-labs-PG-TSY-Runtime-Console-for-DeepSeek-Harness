# Architecture

## Objective

The console is an observability and operator-assistance surface for `pg-tsy-core`. It is not a second execution engine, a trading strategy, or a replacement source of truth.

The plugin must survive three independent failures without making the trading state more dangerous:

1. the browser closes or crashes;
2. the DeepSeek Harness Host restarts;
3. telemetry between Harness and `pg-core` is lost.

None of these is permission to infer that trading stopped.

## Planes

```text
Research plane                    Live runtime plane
--------------                    ------------------
Python / Polars / ML              MarketDataSource
        |                                |
artifact / signal                 Feed freshness
        |                                |
        +-----------------------> StrategyMachine
                                         |
                                      RiskEngine
                                         |
                                        OMS
                                         |
                                ExecutionAdapter
                                  /            \
                           Hyperliquid         IBKR
                                  \            /
                                    venue truth
                                         |
                             Journal / Reconcile
                                         |
                          Ownership / Checkpoint
                                         |
                          Runtime Snapshot API
                                         |
                         Harness Host bridge
                                         |
                          Right Sidebar console
```

The console reads the live plane. It never turns research output into orders.

## Host bridge

V1 uses an authenticated same-origin Host bridge rather than browser-to-runtime calls:

```text
Browser GET /pg-tsy-runtime-console/snapshot
       |
       v
Harness connection trust fence
       |
       v
Host plugin
       |
       | Authorization: Bearer <host only>
       v
PG_TSY_RUNTIME_URL/v1/snapshot
```

The runtime token cannot be inspected from browser JavaScript.

## Runtime truth model

The console derives a conservative display state from facts rather than trusting a process heartbeat.

`SAFE_HOLD` wins when any of these are true:

- backend explicitly reports `SAFE_HOLD`;
- an order has unknown external outcome;
- reconciliation has mismatches;
- a required runtime lease is not owned;
- new exposure is not allowed.

`OFFLINE` is client-derived when telemetry is stale or unavailable. It means **runtime truth cannot be observed**, not `STOPPED`.

## Control boundary

The existing `pg-control` protocol is the future mutation boundary. V1 exposes capabilities but leaves all mutations disabled.

A future mutation path must be:

```text
Harness confirmation
      |
      v
typed ControlRequest + request_id
      |
      v
pg-control authorization / audit
      |
      v
Risk / OMS / Execution
```

Never:

```text
button -> shell -> docker restart
button -> exchange SDK
button -> arbitrary script
```
