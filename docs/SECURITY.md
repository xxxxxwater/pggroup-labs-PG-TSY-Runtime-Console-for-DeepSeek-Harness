# Security

## Threat boundary

The browser is not trusted with trading secrets.

Never expose any of the following to client JavaScript:

- Hyperliquid private keys;
- IBKR credentials/session secrets;
- Binance credentials;
- PostgreSQL credentials;
- SSH keys;
- AWS credentials;
- `PG_TSY_RUNTIME_TOKEN`;
- Docker socket access.

## Same-origin host bridge

Every V1 plugin endpoint asks Harness' `connection.requestRejection(...)` for a rejection before returning runtime data. This preserves Harness' Host/Origin/authentication fence.

The Host process, not the browser, adds the runtime bearer token to upstream requests.

## Fail-closed display semantics

A console connection failure produces:

```text
OFFLINE
Trading state UNKNOWN
```

It must never produce:

```text
STOPPED
No positions
Safe to restart
```

unless those facts were positively proven by authoritative runtime/venue evidence.

## Mutations

V1 mutation controls are disabled.

Future mutations require all of:

1. a typed `pg-control` command;
2. an authenticated actor;
3. unique `request_id` / idempotency;
4. durable command audit;
5. runtime-side validation;
6. Risk/OMS/Execution path for trading effects;
7. explicit confirmation for emergency flatten;
8. no arbitrary shell payloads.

## HTTP transport

Prefer loopback, WireGuard, private VPC, mTLS proxy, or another authenticated private route between Harness Host and `pg-core`. If the runtime URL traverses an untrusted network, use TLS and rotate bearer credentials.
