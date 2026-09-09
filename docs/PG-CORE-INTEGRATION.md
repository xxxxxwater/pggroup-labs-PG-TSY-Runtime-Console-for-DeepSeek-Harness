# pg-core Integration

The runtime observability boundary now exists in `xxxxxwater/pg-tsy-core-bootstrap` as the `pg-observability` crate and is served by `pg-core`.

The console does **not** inspect PostgreSQL tables, Docker state, SSH, exchange APIs or IBKR directly. It consumes the read-only projection owned by the Rust runtime.

## Implemented V1 endpoints

```text
GET /v1/snapshot
GET /v1/events?after=<seq>&limit=<1..200>
```

Snapshot schema:

```text
runtime.snapshot.v1
```

The Rust projection contains:

```text
telemetry
runtime
safety
lease
storage
reconcile
feeds
venues
strategies
positions
orders
performance
capabilities
startup
```

The snapshot is evidence-oriented. A field is `PENDING` or `UNKNOWN` until its authoritative live component reports into `RuntimeObservatory`; process liveness is not converted into a healthy trading state.

## Run pg-core observability locally

At minimum `pg-core` requires an instance id. Shadow mode is the default and is the safest first integration target:

```bash
cd pg-tsy-core-bootstrap/rust

export PG_INSTANCE_ID=pg-shadow-01
export PG_RUN_MODE=shadow
export PG_STRATEGY_DIR=../strategies
export PG_OBSERVABILITY_BIND=127.0.0.1:8787
export PG_OBSERVABILITY_TOKEN='replace-with-a-long-random-secret'

cargo run -p pg-core
```

Expected endpoints:

```bash
curl -H "Authorization: Bearer $PG_OBSERVABILITY_TOKEN" \
  http://127.0.0.1:8787/v1/snapshot

curl -H "Authorization: Bearer $PG_OBSERVABILITY_TOKEN" \
  'http://127.0.0.1:8787/v1/events?after=0&limit=80'
```

The first real snapshot can correctly be `SAFE_HOLD`. Strategy inventory is populated from the actual `StrategyRegistry`, while lease/journal/feed/execution/reconciliation evidence remains closed until the corresponding runtime component reports it.

## Connect the Harness plugin

Set these on the **DeepSeek Harness Host process**, not in browser JavaScript:

```bash
export PG_TSY_RUNTIME_URL=http://127.0.0.1:8787
export PG_TSY_RUNTIME_TOKEN="$PG_OBSERVABILITY_TOKEN"
```

`PG_TSY_TRANSPORT` may be omitted. The plugin now automatically chooses:

```text
PG_TSY_RUNTIME_URL present  -> http
no PG_TSY_RUNTIME_URL       -> mock
```

You may still set it explicitly:

```bash
export PG_TSY_TRANSPORT=http
```

The Host bridge forwards:

```text
/pg-tsy-runtime-console/snapshot
        -> /v1/snapshot

/pg-tsy-runtime-console/events
        -> /v1/events
```

The bearer token never reaches the browser.

## Binding and network safety

`pg-core` defaults to:

```text
127.0.0.1:8787
```

A non-loopback `PG_OBSERVABILITY_BIND` is rejected by the Rust process unless `PG_OBSERVABILITY_TOKEN` is configured. Prefer loopback, WireGuard, Tailscale/private overlay, or an authenticated reverse tunnel instead of exposing the endpoint publicly.

## Contract enforcement in the console

The Harness Host bridge now rejects unexpected upstream payloads rather than rendering them as trading truth:

- snapshot must be `runtime.snapshot.v1`;
- required snapshot objects must exist;
- events response must contain an `events` array;
- invalid HTTP transport configuration fails at plugin startup;
- an unsupported transport cannot silently fall back to Mock.

A schema or upstream failure surfaces as `OFFLINE`, which means telemetry is unavailable — **not** that the trading process is stopped.

## Startup gates

The real Rust snapshot exposes exact startup-gate evidence. The console renders each gate and keeps the runtime in `SAFE_HOLD` while `startup.ready != true`.

Examples include:

```text
JournalWritable
DatabaseReachable
RuntimeLeaseAcquired
VenueAuthenticated
MarketDataSynchronized
OpenOrdersLoaded
PositionsLoaded
OwnershipReconciled
UnknownStateClear
StrategyAllowlistLoaded
LiveTradingExplicitlyEnabled
```

Rust `GateStatus` values are decoded as `PENDING`, `PASSED`, or `FAILED · <reason>`.

## Event ordering

The current `/v1/events` stream is a process-local bounded observability ring with a monotonic process sequence. It is **not** the durable trading journal and must not be used to infer that an exchange side effect did or did not happen.

Live components should publish authoritative transitions such as:

```text
feed.stale
feed.recovered
signal.created
risk.allowed
risk.rejected
journal.intent
journal.dispatch_marked
execution.ack
execution.reject
execution.unknown
oms.partial_fill
oms.filled
reconcile.match
reconcile.mismatch
ownership.unknown
lease.lost
lease.acquired
safety.safe_hold
runtime.halted
```

Venue sequence evidence remains venue-native; the observability event sequence never substitutes for exchange sequencing.

## Next Rust wiring slice

The API carrier is complete. The next production slice is to have existing authoritative components update it:

```text
PostgreSQL lease heartbeat -> RuntimeObservatory.set_lease
Journal/checkpoint          -> set_storage
Subscription supervisor    -> feed/venue state
OMS                         -> set_orders
Position ownership          -> set_positions
Continuous reconcile       -> set_reconcile
Runtime halt               -> set_halted
```

Until each is wired, the console intentionally displays the relevant state as `PENDING`/`UNKNOWN`.

## Control API — later phase

Do not implement control buttons by adding shell endpoints.

The future endpoint must accept the existing typed `pg-control` vocabulary and return a durable request/audit identity, for example conceptually:

```json
{
  "request_id": "uuid",
  "command": { "type": "EmergencyExit" }
}
```

The runtime remains responsible for authentication, idempotency, reconciliation and Risk/OMS/Execution semantics.

## Acceptance before enabling mutations

At minimum:

- continuous reconcile loop is live;
- journal-before-dispatch ordering is proven;
- accepted-but-unpersisted ACK recovery is proven;
- kill-9/network/database failure injection passes;
- emergency flatten is authenticated and idempotent;
- command audit is durable;
- tiny-canary acceptance is complete.
