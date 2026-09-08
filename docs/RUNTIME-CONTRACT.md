# Runtime Contract v1

## Endpoint

```http
GET /v1/snapshot
```

The snapshot is a point-in-time projection. The venue remains authoritative for external side effects; the snapshot must not invent certainty.

## Example

```json
{
  "schema_version": "runtime.snapshot.v1",
  "telemetry": {
    "captured_at": "2026-09-08T14:00:00.000Z",
    "stale_after_ms": 10000,
    "source": "pg-core"
  },
  "runtime": {
    "environment": "production",
    "instance_id": "pg-live-01",
    "mode": "live",
    "version": "57b464139",
    "uptime_sec": 73423,
    "halted": false
  },
  "safety": {
    "state": "NORMAL",
    "allow_new_exposure": true,
    "reason": null,
    "affected_scope": null
  },
  "lease": {
    "required": true,
    "owned": true,
    "owner": "pg-live-01",
    "fencing_token": 1842,
    "heartbeat_age_ms": 438
  },
  "storage": {
    "journal": "HEALTHY",
    "checkpoint_seq": 83120,
    "journal_tail_seq": 83147,
    "pending_dispatch": 0
  },
  "reconcile": {
    "status": "HEALTHY",
    "last_success_age_ms": 1240,
    "mismatch_count": 0,
    "ownership_unknown_count": 0
  },
  "feeds": [],
  "venues": [],
  "strategies": [],
  "positions": [],
  "orders": {
    "open": 0,
    "partial": 0,
    "filled_recent": 0,
    "unknown": 0,
    "recent": []
  },
  "performance": {
    "pnl_today_usd": 0,
    "gross_exposure_usd": 0
  },
  "capabilities": {
    "status": true,
    "logs": true,
    "latency": true,
    "performance": true,
    "start": false,
    "reload_script": false,
    "emergency_exit": false
  }
}
```

## Safety state

Backend values:

```text
NORMAL
SHADOW
DEGRADED
SAFE_HOLD
HALTED
```

`OFFLINE` is a console-side state and should normally not be emitted by `pg-core`.

The console intentionally overrides a falsely optimistic backend state. For example, if `safety.state=NORMAL` but `orders.unknown=1`, the console displays `SAFE_HOLD`.

## Unknown order

An unknown order must retain stable venue identity evidence:

```json
{
  "id": "019b...",
  "venue": "hyperliquid",
  "asset": "SOLUSDT",
  "side": "BUY",
  "status": "UNKNOWN",
  "quantity": 15,
  "filled": null,
  "client_identity": "cloid:019b..."
}
```

For IBKR the identity should be `order_ref:<stable-id>` or an equivalent explicit field.

Unknown external outcome is not rejection and must never be rendered as safe replacement permission.

## Events endpoint

```http
GET /v1/events?after=<seq>&limit=<1..200>
```

Response:

```json
{
  "events": [
    {
      "seq": 83200,
      "at": "2026-09-08T14:00:01.101Z",
      "type": "journal.intent",
      "severity": "info",
      "message": "Order intent durable before dispatch",
      "venue": "hyperliquid",
      "asset": "SOLUSDT"
    }
  ]
}
```

`seq` is a console/event-journal cursor. It must not be misrepresented as an exchange market-data sequence number.
