# UI Specification

## Placement

The console is a DeepSeek Harness right-Sidebar page type named `pg-tsy-runtime`.

The guide entry is **PG TSY Runtime**.

## Header

Always show:

```text
PG TSY Runtime                 [● STATE]
production · pg-live-01 · <version>
```

The state badge represents the safety decision, not process liveness.

## Safety banner

Display a banner whenever state is not `NORMAL`, or when an explicit safety reason exists.

For telemetry failure:

```text
OFFLINE
Telemetry unavailable. This does not prove trading is stopped;
trading state is UNKNOWN.
```

## Views

### Overview

1. Safety
2. Venues
3. Strategies
4. Positions
5. Performance

Safety is deliberately above PnL.

### Orders

1. OMS summary
2. Recent orders
3. Recovery

`UNKNOWN` is visually higher severity than `PARTIAL`.

### Events

Reverse-chronological structured events with:

```text
time | event type
       message
       venue · asset · seq
```

## Controls

V1 buttons:

- Refresh
- Copy diagnosis prompt
- Emergency Exit · not wired (disabled)

The diagnosis prompt explicitly tells DeepSeek to perform read-only diagnostics and forbids production mutations.

## Future compact left rail

A future extension may add:

```text
● PG TSY
  LIVE · NORMAL
```

or:

```text
● PG TSY
  SAFE HOLD · 1
```

Clicking it should open/focus the right-Sidebar page. The compact rail must never duplicate full runtime detail.
