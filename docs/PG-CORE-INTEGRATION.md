# pg-core Integration

## Recommended Rust boundary

Add a read-only observability projection rather than allowing the Harness plugin to inspect PostgreSQL tables or Docker state directly.

Suggested structure:

```rust
pub struct RuntimeSnapshot {
    pub schema_version: String,
    pub telemetry: TelemetrySnapshot,
    pub runtime: RuntimeIdentity,
    pub safety: SafetySnapshot,
    pub lease: LeaseSnapshot,
    pub storage: StorageSnapshot,
    pub reconcile: ReconcileSnapshot,
    pub feeds: Vec<FeedSnapshot>,
    pub venues: Vec<VenueSnapshot>,
    pub strategies: Vec<StrategySnapshot>,
    pub positions: Vec<PositionSnapshot>,
    pub orders: OrderSnapshot,
    pub performance: PerformanceSnapshot,
    pub capabilities: ControlCapabilities,
}
```

This is a projection. It should read from the same in-memory/durable authority used by the live runtime rather than recomputing ownership or order truth independently.

## Required V1 endpoints

```text
GET /v1/snapshot
GET /v1/events?after=<seq>&limit=<n>
```

Bind to loopback/private networking by default.

## Event ordering

The console event cursor may come from the durable runtime journal or a dedicated observability event stream. It must not fabricate venue sequence evidence.

Useful event types:

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

## Control API — later phase

Do not implement the console's control buttons by adding shell endpoints.

The future endpoint should accept the existing typed command vocabulary and return a durable request/audit identity. Example conceptual shape:

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
